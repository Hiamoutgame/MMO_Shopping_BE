import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import * as bcrypt from 'bcryptjs';
import * as crypto from 'crypto';
import { DataSource, IsNull, Repository } from 'typeorm';
import { Cart } from '../../shopping/entities/cart.entity';
import { Wallet } from '../../finance/entities/wallet.entity';
import { LoginDto } from '../dto/login.dto';
import { LogoutDto } from '../dto/logout.dto';
import { RefreshDto } from '../dto/refresh.dto';
import { RegisterDto } from '../dto/register.dto';
import { Account } from '../entities/account.entity';
import { AuthSession } from '../entities/auth-session.entity';
import { Role } from '../entities/role.entity';
import { AccountStatus } from '../enums/account-status.enum';

@Injectable()
export class AuthService {
  constructor(
    @InjectRepository(Account)
    private readonly accountRepository: Repository<Account>,
    @InjectRepository(AuthSession)
    private readonly sessionRepository: Repository<AuthSession>,
    @InjectRepository(Role)
    private readonly roleRepository: Repository<Role>,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly dataSource: DataSource,
  ) {}

  private hashToken(token: string): string {
    return crypto.createHash('sha256').update(token).digest('hex');
  }

  private generateRefreshToken(): string {
    return crypto.randomBytes(40).toString('hex');
  }

  private getAccessTokenExpiresInSeconds(): number {
    const expiresIn = this.configService.get<string | number>('jwt.expiresIn');
    if (typeof expiresIn === 'number') {
      return expiresIn;
    }

    const value = expiresIn || '15m';
    const match = value.match(/^(\d+)([smhd])?$/);
    if (!match) {
      return 900;
    }

    const amount = Number(match[1]);
    const unit = match[2] || 's';
    const multipliers: Record<string, number> = {
      s: 1,
      m: 60,
      h: 60 * 60,
      d: 24 * 60 * 60,
    };

    return amount * multipliers[unit];
  }

  private signAccessToken(
    account: Account,
    roleCode: string,
    sessionId: string,
  ): Promise<string> {
    return this.jwtService.signAsync({
      subject: account.id,
      email: account.email,
      role: roleCode,
      sessionId,
    });
  }

  async register(dto: RegisterDto, meta?: { ip?: string; userAgent?: string }) {
    const existing = await this.accountRepository.findOne({
      where: { email: dto.email.toLowerCase() },
      withDeleted: true,
    });

    if (existing) {
      throw new ConflictException({
        success: false,
        data: null,
        message: 'Email đã tồn tại.',
        errorCode: 'EMAIL_ALREADY_EXISTS',
      });
    }

    let role = await this.roleRepository.findOne({
      where: { code: 'USER' },
    });

    if (!role) {
      role = this.roleRepository.create({
        code: 'USER',
        name: 'User',
      });
      role = await this.roleRepository.save(role);
    }

    const passwordHash = await bcrypt.hash(dto.password, 10);
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    let savedAccount!: Account;
    let savedSession!: AuthSession;
    let rawRefreshToken!: string;

    try {
      const account = queryRunner.manager.create(Account, {
        email: dto.email.toLowerCase(),
        passwordHash,
        name: dto.displayName || dto.email.split('@')[0],
        roleId: role.id,
        status: AccountStatus.ACTIVE,
      });
      savedAccount = await queryRunner.manager.save(Account, account);

      const cart = queryRunner.manager.create(Cart, {
        accountId: savedAccount.id,
      });
      await queryRunner.manager.save(Cart, cart);

      const wallet = queryRunner.manager.create(Wallet, {
        accountId: savedAccount.id,
        currency: 'VND',
        balance: '0',
      });
      await queryRunner.manager.save(Wallet, wallet);

      const tokenFamily = crypto.randomUUID();
      rawRefreshToken = this.generateRefreshToken();
      const refreshTokenHash = this.hashToken(rawRefreshToken);
      const refreshDays =
        this.configService.get<number>('jwt.refreshExpiresInDays') || 7;
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + refreshDays);

      const session = queryRunner.manager.create(AuthSession, {
        accountId: savedAccount.id,
        refreshTokenHash,
        tokenFamily,
        ipAddress: meta?.ip,
        userAgent: meta?.userAgent,
        expiresAt,
      });
      savedSession = await queryRunner.manager.save(AuthSession, session);

      await queryRunner.commitTransaction();
    } catch (error) {
      if (queryRunner.isTransactionActive) {
        await queryRunner.rollbackTransaction();
      }
      throw error;
    } finally {
      await queryRunner.release();
    }

    const accessToken = await this.signAccessToken(
      savedAccount,
      role.code,
      savedSession.id,
    );

    return {
      account: {
        id: savedAccount.id,
        email: savedAccount.email,
        role: role.code,
        status: savedAccount.status,
      },
      tokens: {
        accessToken,
        refreshToken: rawRefreshToken,
        expiresIn: this.getAccessTokenExpiresInSeconds(),
      },
    };
  }

  async login(dto: LoginDto, meta?: { ip?: string; userAgent?: string }) {
    const account = await this.accountRepository.findOne({
      where: { email: dto.email.toLowerCase() },
      relations: { role: true },
    });

    if (!account) {
      throw new UnauthorizedException({
        success: false,
        data: null,
        message: 'Tài khoản hoặc mật khẩu không chính xác.',
        errorCode: 'INVALID_CREDENTIALS',
      });
    }

    const isMatch = await bcrypt.compare(dto.password, account.passwordHash);
    if (!isMatch) {
      throw new UnauthorizedException({
        success: false,
        data: null,
        message: 'Tài khoản hoặc mật khẩu không chính xác.',
        errorCode: 'INVALID_CREDENTIALS',
      });
    }

    if (account.status !== AccountStatus.ACTIVE) {
      throw new ForbiddenException({
        success: false,
        data: null,
        message: 'Tài khoản đã bị vô hiệu hóa.',
        errorCode: 'FORBIDDEN',
      });
    }

    account.lastLoginAt = new Date();
    await this.accountRepository.save(account);

    const tokenFamily = crypto.randomUUID();
    const rawRefreshToken = this.generateRefreshToken();
    const refreshTokenHash = this.hashToken(rawRefreshToken);
    const refreshDays =
      this.configService.get<number>('jwt.refreshExpiresInDays') || 7;
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + refreshDays);

    const session = this.sessionRepository.create({
      accountId: account.id,
      refreshTokenHash,
      tokenFamily,
      ipAddress: meta?.ip,
      userAgent: meta?.userAgent,
      expiresAt,
    });
    const savedSession = await this.sessionRepository.save(session);

    const roleCode = account.role?.code || 'USER';
    const accessToken = await this.signAccessToken(
      account,
      roleCode,
      savedSession.id,
    );

    return {
      account: {
        id: account.id,
        email: account.email,
        role: roleCode,
        status: account.status,
      },
      tokens: {
        accessToken,
        refreshToken: rawRefreshToken,
        expiresIn: this.getAccessTokenExpiresInSeconds(),
      },
    };
  }

  async refresh(dto: RefreshDto, meta?: { ip?: string; userAgent?: string }) {
    const hash = this.hashToken(dto.refreshToken);
    const session = await this.sessionRepository.findOne({
      where: { refreshTokenHash: hash },
      relations: { account: { role: true } },
    });

    if (!session) {
      throw new UnauthorizedException({
        success: false,
        data: null,
        message: 'Refresh token không hợp lệ.',
        errorCode: 'UNAUTHORIZED',
      });
    }

    const now = new Date();
    if (session.revokedAt || session.expiresAt < now) {
      session.reuseDetectedAt = now;
      await this.sessionRepository.save(session);

      await this.sessionRepository
        .createQueryBuilder()
        .update(AuthSession)
        .set({ revokedAt: now })
        .where('tokenFamily = :tokenFamily AND revokedAt IS NULL', {
          tokenFamily: session.tokenFamily,
        })
        .execute();

      throw new UnauthorizedException({
        success: false,
        data: null,
        message: 'Phát hiện token reuse. Toàn bộ session đã bị thu hồi.',
        errorCode: 'REFRESH_TOKEN_REUSED',
      });
    }

    if (!session.account || session.account.status !== AccountStatus.ACTIVE) {
      throw new ForbiddenException({
        success: false,
        data: null,
        message: 'Tài khoản không hoạt động.',
        errorCode: 'FORBIDDEN',
      });
    }

    const rawRefreshToken = this.generateRefreshToken();
    const newHash = this.hashToken(rawRefreshToken);
    const refreshDays =
      this.configService.get<number>('jwt.refreshExpiresInDays') || 7;
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + refreshDays);

    const revokeResult = await this.sessionRepository.update(
      { id: session.id, revokedAt: IsNull() },
      { revokedAt: now },
    );
    if (!revokeResult.affected) {
      throw new UnauthorizedException({
        success: false,
        data: null,
        message: 'Refresh token khÃ´ng há»£p lá»‡.',
        errorCode: 'UNAUTHORIZED',
      });
    }

    const newSession = this.sessionRepository.create({
      accountId: session.accountId,
      refreshTokenHash: newHash,
      tokenFamily: session.tokenFamily,
      ipAddress: meta?.ip,
      userAgent: meta?.userAgent,
      expiresAt,
    });
    const savedNewSession = await this.sessionRepository.save(newSession);

    await this.sessionRepository.update(session.id, {
      replacedBySessionId: savedNewSession.id,
    });

    const roleCode = session.account.role?.code || 'USER';
    const accessToken = await this.signAccessToken(
      session.account,
      roleCode,
      savedNewSession.id,
    );

    return {
      accessToken,
      refreshToken: rawRefreshToken,
      expiresIn: this.getAccessTokenExpiresInSeconds(),
    };
  }

  async logout(dto: LogoutDto, currentSessionId?: string) {
    let targetSessionId = currentSessionId;

    if (dto.refreshToken) {
      const hash = this.hashToken(dto.refreshToken);
      const session = await this.sessionRepository.findOne({
        where: { refreshTokenHash: hash },
      });
      if (session) {
        session.revokedAt = new Date();
        await this.sessionRepository.save(session);
        targetSessionId = session.id;
      }
    } else if (currentSessionId) {
      await this.sessionRepository.update(currentSessionId, {
        revokedAt: new Date(),
      });
    }

    return {
      revokedAt: {
        id: targetSessionId || '',
      },
    };
  }

  async logoutAll(accountId: string) {
    const result = await this.sessionRepository
      .createQueryBuilder()
      .update(AuthSession)
      .set({ revokedAt: new Date() })
      .where('accountId = :accountId AND revokedAt IS NULL', {
        accountId,
      })
      .execute();

    return {
      revokedCount: result.affected || 0,
    };
  }

  async getMe(accountId: string) {
    const account = await this.accountRepository.findOne({
      where: { id: accountId },
      relations: { role: true },
    });

    if (!account) {
      throw new NotFoundException({
        success: false,
        data: null,
        message: 'Account không tồn tại.',
        errorCode: 'NOT_FOUND',
      });
    }

    return {
      id: account.id,
      email: account.email,
      name: account.name,
      phone: account.phone,
      status: account.status,
      lastLoginAt: account.lastLoginAt,
      createdAt: account.createdAt,
      updatedAt: account.updatedAt,
      role: account.role
        ? {
            id: account.role.id,
            code: account.role.code,
            name: account.role.name,
          }
        : null,
    };
  }
}
