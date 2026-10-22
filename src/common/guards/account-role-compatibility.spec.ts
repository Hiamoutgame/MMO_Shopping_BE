import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import type { Request } from 'express';
import { Repository } from 'typeorm';
import { Account } from '../../modules/identity/entities/account.entity';
import { AuthSession } from '../../modules/identity/entities/auth-session.entity';
import { AccountStatus } from '../../modules/identity/enums/account-status.enum';
import { JwtAuthGuard } from './jwt-auth.guard';
import { RolesGuard } from './roles.guard';

function contextFor(request: Request): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => request }),
    getHandler: () => contextFor,
    getClass: () => JwtAuthGuard,
  } as unknown as ExecutionContext;
}

describe('Legacy role compatibility', () => {
  it.each([
    ['SELLER', 'SELLER', 'USER'],
    ['ADMIN', 'USER', 'USER'],
    ['ADMIN', 'ADMIN', 'ADMIN'],
  ])(
    'reads the database role for a %s token and a %s account',
    async (claim, storedRole, expectedRole) => {
      const request = {
        headers: { authorization: 'Bearer test-token' },
      } as Request;
      const sessions = {
        findOne: jest.fn().mockResolvedValue({
          account: { status: AccountStatus.ACTIVE, role: { code: storedRole } },
        }),
      };
      const jwt = {
        verifyAsync: jest.fn().mockResolvedValue({
          subject: 'account-id',
          sessionId: 'session-id',
          role: claim,
        }),
      };
      const guard = new JwtAuthGuard(
        jwt as unknown as JwtService,
        {
          get: jest.fn().mockReturnValue('test-secret'),
        } as unknown as ConfigService,
        sessions as unknown as Repository<AuthSession>,
      );

      expect(await guard.canActivate(contextFor(request))).toBe(true);
      expect(request.user?.roleCode).toBe(expectedRole);
      expect(request.user?.role).toEqual({ code: expectedRole });
    },
  );

  it('does not grant admin access to an existing SELLER account', async () => {
    const request = {
      headers: { authorization: 'Bearer test-token' },
    } as Request;
    const reflector = new Reflector();
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(['ADMIN']);
    const guard = new RolesGuard(
      reflector,
      {
        verifyAsync: jest.fn().mockResolvedValue({
          subject: 'account-id',
          sessionId: 'session-id',
        }),
      } as unknown as JwtService,
      {
        findOne: jest
          .fn()
          .mockResolvedValue({ id: 'account-id', role: { code: 'SELLER' } }),
      } as unknown as Repository<Account>,
    );

    await expect(guard.canActivate(contextFor(request))).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    expect(request.user?.roleCode).toBe('USER');
  });
});
