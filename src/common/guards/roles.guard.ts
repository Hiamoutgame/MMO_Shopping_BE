import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
  ForbiddenException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import type { Request } from 'express';
import { Repository } from 'typeorm';
import { ActiveUserData } from '../decorators/current-user.decorator';
import { Account } from '../../modules/identity/entities/account.entity';

export const ROLES_KEY = 'roles';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(
    private reflector: Reflector,
    private jwtService: JwtService,
    @InjectRepository(Account)
    private accountRepo: Repository<Account>,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const requiredRoles = this.reflector.getAllAndOverride<string[]>(
      ROLES_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (!requiredRoles || requiredRoles.length === 0) {
      return true;
    }

    const request = context.switchToHttp().getRequest<Request>();
    const token = this.extractTokenFromHeader(request);

    if (!token) {
      throw new UnauthorizedException('No token provided');
    }

    try {
      const payload = await this.jwtService.verifyAsync<
        ActiveUserData & { sub?: string }
      >(token);
      const accountId = payload.subject ?? payload.sub;

      if (!accountId) {
        throw new UnauthorizedException(
          'Account identifier missing from token',
        );
      }

      const account = await this.accountRepo.findOne({
        where: { id: accountId },
        relations: { role: true },
      });

      if (!account) {
        throw new UnauthorizedException('Account not found');
      }

      request.user = {
        ...payload,
        id: account.id,
        email: account.email,
        roleCode: account.role.code,
        role: account.role,
        subject: account.id,
      };

      const hasRole = requiredRoles.includes(account.role.code);

      if (!hasRole) {
        throw new ForbiddenException(
          `Role ${account.role.code} does not have access to this resource`,
        );
      }

      return true;
    } catch (error) {
      if (
        error instanceof ForbiddenException ||
        error instanceof UnauthorizedException
      ) {
        throw error;
      }
      throw new UnauthorizedException('Invalid token');
    }
  }

  private extractTokenFromHeader(request: Request): string | undefined {
    const [type, token] = request.headers.authorization?.split(' ') ?? [];
    return type === 'Bearer' ? token : undefined;
  }
}
