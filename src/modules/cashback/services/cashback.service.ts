import {
  BadGatewayException,
  BadRequestException,
  ConflictException,
  HttpException,
  HttpStatus,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  CashbackConnectionLoginDto,
  CashbackListQueryDto,
  CashbackTwoFactorDto,
  CashbackVerifyEmailDto,
  CreateCashbackLinkDto,
  CreateCashbackPaymentAccountDto,
  CreateCashbackWithdrawalDto,
  CashbackWithdrawalOtpDto,
} from '../dto/cashback.dto';
import { CashbackConnection } from '../entities/cashback-connection.entity';
import { CashbackConnectionStatus } from '../enums/cashback-connection-status.enum';
import { compactQuery, normalizeProviderData } from './cashback-normalizer';
import {
  HoanPhiClientService,
  HoanPhiProviderError,
} from './hoanphi-client.service';
import { IntegrationCredentialService } from './integration-credential.service';

interface ProviderAuthResult {
  token?: string;
  token_type?: string;
  user?: Record<string, unknown>;
  challenge_token?: string;
  methods?: string[];
  email_verification_required?: boolean;
}

interface StoredChallenge {
  challengeToken?: string;
  email: string;
}

@Injectable()
export class CashbackService {
  private configCache?: { value: unknown; expiresAt: number };

  constructor(
    @InjectRepository(CashbackConnection)
    private readonly connectionRepository: Repository<CashbackConnection>,
    private readonly client: HoanPhiClientService,
    private readonly credentials: IntegrationCredentialService,
  ) {}

  async getConfig(): Promise<unknown> {
    if (this.configCache && this.configCache.expiresAt > Date.now()) {
      return this.configCache.value;
    }
    try {
      const value = normalizeProviderData(
        await this.client.request<Record<string, unknown>>('GET', '/config'),
      );
      this.configCache = { value, expiresAt: Date.now() + 5 * 60 * 1000 };
      return value;
    } catch (error) {
      this.throwProviderError(error, false);
    }
  }

  async getConnection(accountId: string) {
    const connection = await this.connectionRepository.findOne({
      where: { accountId },
    });
    if (!connection) return { status: CashbackConnectionStatus.DISCONNECTED };
    return this.serializeConnection(connection);
  }

  async login(accountId: string, dto: CashbackConnectionLoginDto) {
    try {
      const result = await this.client.request<ProviderAuthResult>(
        'POST',
        '/auth/login',
        {
          body: {
            email: dto.email.toLowerCase(),
            password: dto.password,
            ...(dto.deviceName ? { device_name: dto.deviceName } : {}),
          },
        },
      );
      return this.consumeAuthResult(accountId, dto.email.toLowerCase(), result);
    } catch (error) {
      this.throwProviderError(error, false);
    }
  }

  async completeTwoFactor(accountId: string, dto: CashbackTwoFactorDto) {
    if (!dto.google2faCode && !dto.emailOtpCode) {
      throw this.badRequest(
        'Vui lòng nhập mã xác thực.',
        'CASHBACK_OTP_REQUIRED',
      );
    }
    const { connection, challenge } = await this.getActiveChallenge(accountId);
    try {
      const result = await this.client.request<ProviderAuthResult>(
        'POST',
        '/auth/login/2fa',
        {
          body: {
            challenge_token: challenge.challengeToken,
            ...(dto.google2faCode ? { google2fa_code: dto.google2faCode } : {}),
            ...(dto.emailOtpCode ? { email_otp_code: dto.emailOtpCode } : {}),
          },
        },
      );
      return this.consumeAuthResult(
        accountId,
        connection.providerEmail || challenge.email,
        result,
      );
    } catch (error) {
      this.throwProviderError(error, false);
    }
  }

  async resendTwoFactor(accountId: string) {
    const { challenge } = await this.getActiveChallenge(accountId);
    try {
      return normalizeProviderData(
        await this.client.request<Record<string, unknown>>(
          'POST',
          '/auth/login/2fa/resend',
          {
            body: { challenge_token: challenge.challengeToken },
          },
        ),
      );
    } catch (error) {
      this.throwProviderError(error, false);
    }
  }

  async verifyEmail(accountId: string, dto: CashbackVerifyEmailDto) {
    const { connection, challenge } = await this.getActiveChallenge(accountId);
    try {
      const result = await this.client.request<ProviderAuthResult>(
        'POST',
        '/auth/verify-email',
        {
          body: {
            challenge_token: challenge.challengeToken,
            email: challenge.email,
            email_otp_code: dto.code,
            otp_code: dto.code,
          },
        },
      );
      return this.consumeAuthResult(
        accountId,
        connection.providerEmail || challenge.email,
        result,
      );
    } catch (error) {
      this.throwProviderError(error, false);
    }
  }

  async resendVerifyEmail(accountId: string) {
    const { challenge } = await this.getActiveChallenge(accountId);
    try {
      return normalizeProviderData(
        await this.client.request<Record<string, unknown>>(
          'POST',
          '/auth/verify-email/resend',
          {
            body: {
              challenge_token: challenge.challengeToken,
              email: challenge.email,
            },
          },
        ),
      );
    } catch (error) {
      this.throwProviderError(error, false);
    }
  }

  async unlink(accountId: string) {
    const connection = await this.connectionRepository.findOne({
      where: { accountId },
    });
    if (!connection) return { status: CashbackConnectionStatus.DISCONNECTED };
    if (connection.encryptedAccessToken) {
      try {
        const token = this.credentials.decrypt<string>(
          connection.encryptedAccessToken,
        );
        await this.client.request<unknown>('POST', '/auth/logout', { token });
      } catch {
        // Unlink local credentials even when provider logout is unavailable.
      }
    }
    connection.status = CashbackConnectionStatus.DISCONNECTED;
    connection.encryptedAccessToken = null;
    connection.encryptedChallenge = null;
    connection.challengeMethods = null;
    connection.challengeExpiresAt = null;
    connection.reauthRequiredAt = null;
    await this.connectionRepository.save(connection);
    return this.serializeConnection(connection);
  }

  createLink(accountId: string, dto: CreateCashbackLinkDto) {
    return this.authenticatedRequest(accountId, 'POST', '/cashback/link', {
      body: { url: dto.url },
    });
  }

  getAccount(accountId: string) {
    return this.authenticatedRequest(accountId, 'GET', '/account');
  }

  listOrders(accountId: string, query: CashbackListQueryDto) {
    return this.authenticatedRequest(accountId, 'GET', '/orders', {
      query: compactQuery(query as Record<string, unknown>),
    });
  }

  getOrder(accountId: string, id: string) {
    return this.authenticatedRequest(
      accountId,
      'GET',
      `/orders/${encodeURIComponent(id)}`,
    );
  }

  listWithdrawals(accountId: string, query: CashbackListQueryDto) {
    return this.authenticatedRequest(accountId, 'GET', '/withdrawals', {
      query: compactQuery(query as Record<string, unknown>),
    });
  }

  createWithdrawal(accountId: string, dto: CreateCashbackWithdrawalDto) {
    return this.authenticatedRequest(accountId, 'POST', '/withdrawals', {
      body: {
        amount: dto.amount,
        payment_method: dto.paymentMethod,
        account_number: dto.accountNumber,
        account_name: dto.accountName,
        ...(dto.bankName ? { bank_name: dto.bankName } : {}),
        ...(dto.walletName ? { wallet_name: dto.walletName } : {}),
        ...(dto.otpCode ? { otp_code: dto.otpCode } : {}),
      },
    });
  }

  sendWithdrawalOtp(accountId: string, dto: CashbackWithdrawalOtpDto) {
    return this.authenticatedRequest(accountId, 'POST', '/withdrawals/otp', {
      body: dto.email ? { email: dto.email } : {},
    });
  }

  listPaymentAccounts(accountId: string) {
    return this.authenticatedRequest(accountId, 'GET', '/payment-accounts');
  }

  createPaymentAccount(
    accountId: string,
    dto: CreateCashbackPaymentAccountDto,
  ) {
    return this.authenticatedRequest(accountId, 'POST', '/payment-accounts', {
      body: {
        payment_method: dto.paymentMethod,
        bank_name: dto.bankName,
        account_number: dto.accountNumber,
        account_name: dto.accountName,
        is_default: dto.isDefault ?? false,
      },
    });
  }

  setDefaultPaymentAccount(accountId: string, id: string) {
    return this.authenticatedRequest(
      accountId,
      'POST',
      `/payment-accounts/${encodeURIComponent(id)}/default`,
    );
  }

  deletePaymentAccount(accountId: string, id: string) {
    return this.authenticatedRequest(
      accountId,
      'DELETE',
      `/payment-accounts/${encodeURIComponent(id)}`,
    );
  }

  getReferrals(accountId: string, query: CashbackListQueryDto) {
    return this.authenticatedRequest(accountId, 'GET', '/referrals', {
      query: compactQuery(query as Record<string, unknown>),
    });
  }

  listBalanceLogs(accountId: string, query: CashbackListQueryDto) {
    return this.authenticatedRequest(accountId, 'GET', '/balance-logs', {
      query: compactQuery(query as Record<string, unknown>),
    });
  }

  private async authenticatedRequest(
    accountId: string,
    method: 'GET' | 'POST' | 'DELETE',
    path: string,
    options: {
      body?: Record<string, unknown>;
      query?: Record<string, string | number>;
    } = {},
  ): Promise<unknown> {
    const connection = await this.connectionRepository.findOne({
      where: { accountId },
    });
    if (
      !connection ||
      connection.status !== CashbackConnectionStatus.CONNECTED ||
      !connection.encryptedAccessToken
    ) {
      throw this.reauthRequired();
    }
    const token = this.credentials.decrypt<string>(
      connection.encryptedAccessToken,
    );
    try {
      const result = await this.client.request<Record<string, unknown>>(
        method,
        path,
        {
          ...options,
          token,
        },
      );
      connection.lastUsedAt = new Date();
      await this.connectionRepository.save(connection);
      return normalizeProviderData(result);
    } catch (error) {
      if (error instanceof HoanPhiProviderError && error.status === 401) {
        connection.status = CashbackConnectionStatus.REAUTH_REQUIRED;
        connection.reauthRequiredAt = new Date();
        connection.encryptedAccessToken = null;
        await this.connectionRepository.save(connection);
        throw this.reauthRequired();
      }
      this.throwProviderError(error, true);
    }
  }

  private async consumeAuthResult(
    accountId: string,
    email: string,
    result: ProviderAuthResult,
  ) {
    let connection = await this.connectionRepository.findOne({
      where: { accountId },
    });
    connection ??= this.connectionRepository.create({ accountId });
    connection.providerEmail = email;

    if (result.token) {
      const providerId = result.user?.id;
      connection.providerUserId =
        typeof providerId === 'string' || typeof providerId === 'number'
          ? String(providerId)
          : null;
      connection.tokenType = result.token_type || 'Bearer';
      connection.encryptedAccessToken = this.credentials.encrypt(result.token);
      connection.status = CashbackConnectionStatus.CONNECTED;
      connection.connectedAt = new Date();
      connection.lastUsedAt = new Date();
      connection.reauthRequiredAt = null;
      connection.encryptedChallenge = null;
      connection.challengeMethods = null;
      connection.challengeExpiresAt = null;
      await this.connectionRepository.save(connection);
      return this.serializeConnection(connection);
    }

    if (result.challenge_token || result.email_verification_required) {
      connection.encryptedAccessToken = null;
      connection.encryptedChallenge = this.credentials.encrypt({
        challengeToken: result.challenge_token,
        email,
      } satisfies StoredChallenge);
      connection.challengeMethods = result.methods ?? [];
      connection.challengeExpiresAt = new Date(Date.now() + 10 * 60 * 1000);
      connection.status = CashbackConnectionStatus.DISCONNECTED;
      await this.connectionRepository.save(connection);
      return {
        ...this.serializeConnection(connection),
        nextStep: result.email_verification_required
          ? 'VERIFY_EMAIL'
          : 'TWO_FACTOR',
        methods: result.methods ?? [],
      };
    }

    throw new BadGatewayException({
      success: false,
      data: null,
      message: 'Phản hồi đăng nhập của dịch vụ hoàn phí không hợp lệ.',
      errorCode: 'CASHBACK_INVALID_AUTH_RESPONSE',
    });
  }

  private async getActiveChallenge(accountId: string) {
    const connection = await this.connectionRepository.findOne({
      where: { accountId },
    });
    if (
      !connection?.encryptedChallenge ||
      !connection.challengeExpiresAt ||
      connection.challengeExpiresAt.getTime() <= Date.now()
    ) {
      throw this.badRequest(
        'Phiên xác thực đã hết hạn. Vui lòng đăng nhập lại.',
        'CASHBACK_CHALLENGE_EXPIRED',
      );
    }
    return {
      connection,
      challenge: this.credentials.decrypt<StoredChallenge>(
        connection.encryptedChallenge,
      ),
    };
  }

  private serializeConnection(connection: CashbackConnection) {
    return {
      status: connection.status,
      providerUserId: connection.providerUserId ?? null,
      providerEmail: connection.providerEmail ?? null,
      connectedAt: connection.connectedAt?.toISOString() ?? null,
      lastUsedAt: connection.lastUsedAt?.toISOString() ?? null,
      challengeMethods: connection.challengeMethods ?? [],
    };
  }

  private reauthRequired() {
    return new ConflictException({
      success: false,
      data: null,
      message: 'Vui lòng liên kết lại tài khoản Hoàn Phí 247.',
      errorCode: 'CASHBACK_REAUTH_REQUIRED',
    });
  }

  private badRequest(message: string, errorCode: string) {
    return new BadRequestException({
      success: false,
      data: null,
      message,
      errorCode,
    });
  }

  private throwProviderError(error: unknown, authenticated: boolean): never {
    if (!(error instanceof HoanPhiProviderError)) throw error;
    if (error.status === 401) {
      throw this.badRequest(
        authenticated ? 'Phiên hoàn phí không hợp lệ.' : error.message,
        authenticated
          ? 'CASHBACK_REAUTH_REQUIRED'
          : 'CASHBACK_INVALID_CREDENTIALS',
      );
    }
    if (error.status === 404) {
      throw new NotFoundException({
        success: false,
        data: null,
        message: error.message,
        errorCode: error.code || 'CASHBACK_NOT_FOUND',
      });
    }
    if (error.status === 429) {
      throw new HttpException(
        {
          success: false,
          data: null,
          message: error.message,
          errorCode: 'CASHBACK_RATE_LIMITED',
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
    if (error.status >= 400 && error.status < 500) {
      throw this.badRequest(
        error.message,
        error.code || 'CASHBACK_PROVIDER_REJECTED',
      );
    }
    throw new BadGatewayException({
      success: false,
      data: null,
      message: error.message,
      errorCode: error.code || 'CASHBACK_PROVIDER_UNAVAILABLE',
    });
  }
}
