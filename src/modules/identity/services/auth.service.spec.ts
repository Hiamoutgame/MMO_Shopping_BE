import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { DataSource, Repository } from 'typeorm';
import { AuthService } from './auth.service';
import { Account } from '../entities/account.entity';
import { AuthSession } from '../entities/auth-session.entity';
import { Role } from '../entities/role.entity';
import { AccountStatus } from '../enums/account-status.enum';
import * as bcrypt from 'bcryptjs';

describe('AuthService', () => {
  let service: AuthService;
  let accountRepo: jest.Mocked<Pick<Repository<Account>, 'findOne' | 'save'>>;
  let sessionRepo: jest.Mocked<
    Pick<
      Repository<AuthSession>,
      'create' | 'createQueryBuilder' | 'findOne' | 'save' | 'update'
    >
  >;
  let roleRepo: jest.Mocked<
    Pick<Repository<Role>, 'create' | 'findOne' | 'save'>
  >;
  let jwtService: jest.Mocked<Pick<JwtService, 'signAsync'>>;
  let configService: jest.Mocked<Pick<ConfigService, 'get'>>;
  let dataSource: jest.Mocked<Pick<DataSource, 'createQueryRunner'>>;

  beforeEach(async () => {
    accountRepo = {
      findOne: jest.fn(),
      save: jest.fn(),
    };
    sessionRepo = {
      findOne: jest.fn(),
      create: jest.fn().mockImplementation((d: Partial<AuthSession>) => d),
      save: jest
        .fn()
        .mockImplementation((d: Partial<AuthSession>) =>
          Promise.resolve({ id: 'session-id-1', ...d }),
        ),
      update: jest.fn(),
      createQueryBuilder: jest.fn().mockReturnValue({
        update: jest.fn().mockReturnThis(),
        set: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        execute: jest.fn().mockResolvedValue({ affected: 1 }),
      }),
    };
    roleRepo = {
      findOne: jest.fn(),
      create: jest.fn().mockImplementation((d: Partial<Role>) => d),
      save: jest
        .fn()
        .mockImplementation((d: Partial<Role>) =>
          Promise.resolve({ id: 'role-id-1', ...d }),
        ),
    };
    jwtService = {
      signAsync: jest.fn().mockResolvedValue('mock-access-token'),
    };
    configService = {
      get: jest.fn().mockImplementation((key: string) => {
        if (key === 'jwt.secret') return 'secret';
        if (key === 'jwt.expiresIn') return '15m';
        if (key === 'jwt.refreshExpiresInDays') return 7;
        return null;
      }),
    };
    const mockQueryRunner = {
      connect: jest.fn(),
      startTransaction: jest.fn(),
      commitTransaction: jest.fn(),
      rollbackTransaction: jest.fn(),
      release: jest.fn(),
      isTransactionActive: true,
      manager: {
        create: jest
          .fn()
          .mockImplementation(
            (_entity: new () => unknown, d: Record<string, unknown>) => d,
          ),
        save: jest
          .fn()
          .mockImplementation((_entity: new () => unknown, d: object) =>
            Promise.resolve({ id: 'id-123', ...d }),
          ),
      },
    };
    dataSource = {
      createQueryRunner: jest.fn().mockReturnValue(mockQueryRunner),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: getRepositoryToken(Account), useValue: accountRepo },
        { provide: getRepositoryToken(AuthSession), useValue: sessionRepo },
        { provide: getRepositoryToken(Role), useValue: roleRepo },
        { provide: JwtService, useValue: jwtService },
        { provide: ConfigService, useValue: configService },
        { provide: DataSource, useValue: dataSource },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('login', () => {
    it('should throw UnauthorizedException if account not found', async () => {
      accountRepo.findOne.mockResolvedValue(null);
      await expect(
        service.login({ email: 'test@example.com', password: 'password' }),
      ).rejects.toThrow();
    });

    it('should authenticate successfully with correct credentials', async () => {
      const passwordHash = await bcrypt.hash('secret123', 10);
      accountRepo.findOne.mockResolvedValue({
        id: 'acc-1',
        email: 'test@example.com',
        passwordHash,
        status: AccountStatus.ACTIVE,
        role: { code: 'USER' },
      });

      const res = await service.login({
        email: 'test@example.com',
        password: 'secret123',
      });

      expect(res.account.email).toBe('test@example.com');
      expect(res.tokens.accessToken).toBe('mock-access-token');
      expect(res.tokens.refreshToken).toBeDefined();
    });
  });
});
