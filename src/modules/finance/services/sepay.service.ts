import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { createHash, randomInt, timingSafeEqual } from 'crypto';
import { DataSource, EntityManager, Repository } from 'typeorm';
import type { QueryDeepPartialEntity } from 'typeorm/query-builder/QueryPartialEntity';
import { formatMoney, money } from '../../../common/utils/money';
import { Account } from '../../identity/entities/account.entity';
import { IdempotencyService } from '../../system/services/idempotency.service';
import {
  CreateSepayDepositDto,
  QuerySepayTransactionsDto,
  ResolveSepayTransactionDto,
  SepayResolveAction,
} from '../dto/sepay.dto';
import { PaymentTransaction } from '../entities/payment-transaction.entity';
import { SepayTransaction } from '../entities/sepay-transaction.entity';
import { PaymentProvider } from '../enums/payment-provider.enum';
import { PaymentTransactionStatus } from '../enums/payment-transaction-status.enum';
import { PaymentType } from '../enums/payment-type.enum';
import { SepayTransactionStatus } from '../enums/sepay-transaction-status.enum';
import {
  extractPaymentCode,
  parseSepayWebhook,
  SepayIncomingTransaction,
} from '../sepay/sepay-payload';
import { readSepayConfig, SepayConfig } from '../sepay/sepay.config';
import { FinanceService } from './finance.service';

export type SepaySource = 'WEBHOOK' | 'RECONCILE';

// Lý do một giao dịch tiền vào không tự cộng ví được.
export const UNMATCHED_REASONS = {
  NO_CODE: 'Không tìm thấy mã nạp trong nội dung chuyển khoản.',
  CODE_NOT_FOUND: 'Mã nạp không thuộc lệnh nạp nào.',
  ALREADY_COMPLETED: 'Lệnh nạp này đã được cộng tiền trước đó.',
  NOT_PENDING: 'Lệnh nạp không còn ở trạng thái chờ.',
  WRONG_ACCOUNT: 'Tiền vào tài khoản ngân hàng khác tài khoản cấu hình.',
  ZERO_AMOUNT: 'Số tiền bằng 0.',
} as const;

export interface PaymentEvent {
  at: string;
  event: string;
  [key: string]: unknown;
}

const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

/**
 * Nạp ví qua chuyển khoản ngân hàng, SePay báo tiền vào.
 *
 * Chống cộng trùng có 3 lớp:
 * 1. `sepay_transactions.sepay_id` unique: SePay retry cùng giao dịch thì
 *    dòng thứ hai bị bỏ qua.
 * 2. Lệnh nạp bị khoá (FOR UPDATE) và chỉ chuyển PENDING → SUCCEEDED một lần.
 * 3. Bút toán ví có idempotency key `sepay:<id>` (unique) và unique theo
 *    payment_transaction_id.
 */
@Injectable()
export class SepayService {
  private readonly logger = new Logger(SepayService.name);

  constructor(
    @InjectRepository(PaymentTransaction)
    private readonly paymentRepository: Repository<PaymentTransaction>,
    @InjectRepository(SepayTransaction)
    private readonly sepayRepository: Repository<SepayTransaction>,
    private readonly dataSource: DataSource,
    private readonly configService: ConfigService,
    private readonly idempotencyService: IdempotencyService,
    private readonly financeService: FinanceService,
  ) {}

  get config(): SepayConfig {
    return readSepayConfig(this.configService);
  }

  publicSettings() {
    const config = this.config;
    return {
      enabled: Boolean(config.bankCode && config.accountNumber),
      minDepositAmount: config.minDepositAmount,
      depositExpiresMinutes: config.depositExpiresMinutes,
    };
  }

  async createDeposit(
    accountId: string,
    dto: CreateSepayDepositDto,
    idempotencyKey?: string,
  ) {
    const config = this.config;
    if (!config.bankCode || !config.accountNumber) {
      throw new ServiceUnavailableException({
        success: false,
        data: null,
        message: 'Nạp tiền qua chuyển khoản chưa được cấu hình.',
        errorCode: 'SEPAY_NOT_CONFIGURED',
      });
    }
    if (!idempotencyKey) {
      throw new BadRequestException({
        success: false,
        data: null,
        message: 'Idempotency-Key header is required.',
        errorCode: 'IDEMPOTENCY_KEY_REQUIRED',
      });
    }
    if (money(dto.amount).lt(config.minDepositAmount)) {
      throw new BadRequestException({
        success: false,
        data: null,
        message: `Số tiền nạp tối thiểu là ${config.minDepositAmount} VND.`,
        errorCode: 'DEPOSIT_AMOUNT_TOO_SMALL',
      });
    }

    return this.dataSource.transaction(async (manager) => {
      const idempotency = await this.idempotencyService.begin(
        manager,
        'sepay-deposit',
        idempotencyKey,
        this.idempotencyService.hash(dto),
        accountId,
      );
      if (idempotency.state === 'REPLAY') {
        return idempotency.record.responseBody;
      }

      const wallet = await this.financeService.ensureWallet(accountId, manager);
      const now = new Date();
      const code = await this.newPaymentCode(manager, config.paymentPrefix);
      const payment = await manager.save(
        PaymentTransaction,
        manager.create(PaymentTransaction, {
          accountId,
          walletId: wallet.id,
          provider: PaymentProvider.SEPAY,
          providerTransactionId: null,
          merchantReference: code,
          type: PaymentType.DEPOSIT,
          amount: formatMoney(dto.amount),
          currency: 'VND',
          status: PaymentTransactionStatus.PENDING,
          idempotencyKey: `sepay-deposit:${this.sha256(`${accountId}:${idempotencyKey}`).slice(0, 64)}`,
          expiresAt: new Date(
            now.getTime() + config.depositExpiresMinutes * 60_000,
          ),
          // Lưu thông tin chuyển khoản tại thời điểm tạo, đổi cấu hình sau
          // không làm sai lệnh cũ.
          metadata: {
            adapter: 'SEPAY',
            requestedAmount: formatMoney(dto.amount),
            bank: {
              bankCode: config.bankCode,
              accountNumber: config.accountNumber,
              accountHolder: config.accountHolder,
            },
            events: [
              this.event('CREATED', { amount: formatMoney(dto.amount) }, now),
            ],
          },
        }),
      );
      const response = { deposit: this.serializeDeposit(payment) };
      await this.idempotencyService.complete(
        manager,
        idempotency.record,
        response,
      );
      return response;
    });
  }

  async getMyDeposit(accountId: string, id: string) {
    const payment = await this.paymentRepository.findOne({
      where: { id, accountId, provider: PaymentProvider.SEPAY },
    });
    if (!payment) {
      throw new NotFoundException({
        success: false,
        data: null,
        message: 'Không tìm thấy lệnh nạp.',
        errorCode: 'NOT_FOUND',
      });
    }
    return { deposit: this.serializeDeposit(payment) };
  }

  async listMyDeposits(accountId: string, page = 1, pageSize = 20) {
    const [items, total] = await this.paymentRepository.findAndCount({
      where: {
        accountId,
        provider: PaymentProvider.SEPAY,
        type: PaymentType.DEPOSIT,
      },
      order: { createdAt: 'DESC' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    });
    return {
      items: items.map((item) => this.serializeDeposit(item)),
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
    };
  }

  /** Webhook SePay: luôn trả 200 khi đã lưu được giao dịch để SePay ngừng retry. */
  async handleWebhook(authorization: string | undefined, body: unknown) {
    this.assertWebhookAuthorized(authorization);
    const incoming = parseSepayWebhook(body);
    if (!incoming) {
      throw new BadRequestException({
        success: false,
        data: null,
        message: 'Payload SePay không hợp lệ.',
        errorCode: 'SEPAY_INVALID_PAYLOAD',
      });
    }
    return this.processIncoming(incoming, 'WEBHOOK');
  }

  /**
   * Ghi nhận một giao dịch ngân hàng và cộng ví nếu khớp lệnh nạp. Gọi lại
   * nhiều lần với cùng sepayId là an toàn.
   */
  async processIncoming(
    incoming: SepayIncomingTransaction,
    source: SepaySource,
  ) {
    const config = this.config;
    return this.dataSource.transaction(async (manager) => {
      const code = extractPaymentCode(
        config.paymentPrefix,
        incoming.code,
        incoming.content,
      );
      const inserted = await manager
        .createQueryBuilder()
        .insert()
        .into(SepayTransaction)
        .values({
          sepayId: incoming.sepayId,
          gateway: incoming.gateway,
          transactionDate: incoming.transactionDate,
          accountNumber: incoming.accountNumber,
          code,
          content: incoming.content,
          transferType: incoming.transferType,
          transferAmount: formatMoney(String(incoming.transferAmount)),
          referenceCode: incoming.referenceCode,
          source,
          status: SepayTransactionStatus.UNMATCHED,
          payload: incoming.raw as QueryDeepPartialEntity<
            Record<string, unknown>
          >,
        })
        .orIgnore()
        .returning(['id'])
        .execute();
      const rowId = (inserted.raw as { id: string }[])[0]?.id;
      if (!rowId) {
        // Đã nhận giao dịch này (SePay retry, hoặc webhook và đối soát cùng
        // thấy). Không xử lý lại.
        const existing = await manager.findOneOrFail(SepayTransaction, {
          where: { sepayId: incoming.sepayId },
        });
        return { duplicate: true, status: existing.status, id: existing.id };
      }

      const result = await this.match(manager, incoming, code, config);
      await manager.update(SepayTransaction, rowId, {
        status: result.status,
        note: result.note ?? null,
        paymentTransactionId: result.paymentTransactionId ?? null,
      });
      if (result.status === SepayTransactionStatus.UNMATCHED) {
        this.logger.warn(
          `SePay ${incoming.sepayId} chưa khớp: ${result.note ?? ''}`,
        );
      }
      return { duplicate: false, status: result.status, id: rowId };
    });
  }

  async listTransactions(query: QuerySepayTransactionsDto) {
    const page = query.page || 1;
    const pageSize = query.pageSize || 20;
    const [items, total] = await this.sepayRepository.findAndCount({
      where: query.status ? { status: query.status } : {},
      relations: { paymentTransaction: true },
      order: { createdAt: 'DESC' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    });
    return {
      items: items.map((item) => this.serializeSepay(item)),
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
    };
  }

  /** Admin xử lý giao dịch chưa khớp: cộng thủ công cho một tài khoản, hoặc bỏ qua. */
  async resolve(adminId: string, id: string, dto: ResolveSepayTransactionDto) {
    return this.dataSource.transaction(async (manager) => {
      const row = await manager.findOne(SepayTransaction, {
        where: { id },
        lock: { mode: 'pessimistic_write' },
      });
      if (!row) {
        throw new NotFoundException({
          success: false,
          data: null,
          message: 'Không tìm thấy giao dịch SePay.',
          errorCode: 'NOT_FOUND',
        });
      }
      if (row.status !== SepayTransactionStatus.UNMATCHED) {
        throw new ConflictException({
          success: false,
          data: null,
          message: 'Chỉ xử lý được giao dịch đang chưa khớp.',
          errorCode: 'SEPAY_TRANSACTION_NOT_UNMATCHED',
        });
      }

      const now = new Date();
      if (dto.action === SepayResolveAction.IGNORE) {
        row.status = SepayTransactionStatus.IGNORED;
      } else {
        if (row.transferType !== 'in' || money(row.transferAmount).lte(0)) {
          throw new BadRequestException({
            success: false,
            data: null,
            message: 'Chỉ cộng ví được cho giao dịch tiền vào.',
            errorCode: 'SEPAY_TRANSACTION_NOT_CREDITABLE',
          });
        }
        const account = await manager.findOne(Account, {
          where: dto.accountId
            ? { id: dto.accountId }
            : { email: (dto.accountEmail ?? '').toLowerCase() },
        });
        if (!account) {
          throw new NotFoundException({
            success: false,
            data: null,
            message: 'Không tìm thấy tài khoản cần cộng tiền.',
            errorCode: 'ACCOUNT_NOT_FOUND',
          });
        }
        const wallet = await this.financeService.ensureWallet(
          account.id,
          manager,
        );
        const payment = await manager.save(
          PaymentTransaction,
          manager.create(PaymentTransaction, {
            accountId: account.id,
            walletId: wallet.id,
            provider: PaymentProvider.SEPAY,
            providerTransactionId: row.sepayId,
            merchantReference: `SEPAY-MANUAL-${row.sepayId}`,
            type: PaymentType.DEPOSIT,
            amount: row.transferAmount,
            currency: 'VND',
            status: PaymentTransactionStatus.SUCCEEDED,
            idempotencyKey: `sepay-manual:${row.sepayId}`,
            completedAt: now,
            metadata: {
              adapter: 'SEPAY',
              manual: true,
              sepayTransactionId: row.id,
              events: [
                this.event(
                  'MANUAL_CREDIT',
                  { by: adminId, note: dto.note, amount: row.transferAmount },
                  now,
                ),
              ],
            },
          }),
        );
        // Cùng idempotency key với luồng tự động: một giao dịch ngân hàng
        // không bao giờ cộng ví hai lần dù đi đường nào.
        await this.financeService.credit(manager, {
          accountId: account.id,
          amount: row.transferAmount,
          currency: 'VND',
          purpose: 'DEPOSIT',
          idempotencyKey: `sepay:${row.sepayId}`,
          paymentTransactionId: payment.id,
          description: `Nạp SePay (admin xử lý) #${row.sepayId}`,
        });
        row.status = SepayTransactionStatus.RESOLVED;
        row.paymentTransactionId = payment.id;
      }

      row.note = [row.note, `Admin: ${dto.note}`].filter(Boolean).join(' | ');
      row.resolvedBy = adminId;
      row.resolvedAt = now;
      await manager.save(SepayTransaction, row);
      const saved = await manager.findOneOrFail(SepayTransaction, {
        where: { id: row.id },
        relations: { paymentTransaction: true },
      });
      return { sepayTransaction: this.serializeSepay(saved) };
    });
  }

  private async match(
    manager: EntityManager,
    incoming: SepayIncomingTransaction,
    code: string | null,
    config: SepayConfig,
  ): Promise<{
    status: SepayTransactionStatus;
    note?: string;
    paymentTransactionId?: string;
  }> {
    if (incoming.transferType !== 'in') {
      return { status: SepayTransactionStatus.IGNORED, note: 'Tiền ra.' };
    }
    if (incoming.transferAmount <= 0) {
      return {
        status: SepayTransactionStatus.IGNORED,
        note: UNMATCHED_REASONS.ZERO_AMOUNT,
      };
    }
    if (
      config.accountNumber &&
      incoming.accountNumber &&
      incoming.accountNumber !== config.accountNumber &&
      incoming.subAccount !== config.accountNumber
    ) {
      return {
        status: SepayTransactionStatus.UNMATCHED,
        note: UNMATCHED_REASONS.WRONG_ACCOUNT,
      };
    }
    if (!code) {
      return {
        status: SepayTransactionStatus.UNMATCHED,
        note: UNMATCHED_REASONS.NO_CODE,
      };
    }

    const payment = await manager.findOne(PaymentTransaction, {
      where: { provider: PaymentProvider.SEPAY, merchantReference: code },
      lock: { mode: 'pessimistic_write' },
    });
    if (!payment) {
      return {
        status: SepayTransactionStatus.UNMATCHED,
        note: UNMATCHED_REASONS.CODE_NOT_FOUND,
      };
    }
    if (payment.status !== PaymentTransactionStatus.PENDING) {
      return {
        status: SepayTransactionStatus.UNMATCHED,
        note:
          payment.status === PaymentTransactionStatus.SUCCEEDED
            ? UNMATCHED_REASONS.ALREADY_COMPLETED
            : UNMATCHED_REASONS.NOT_PENDING,
      };
    }

    // Cộng đúng số tiền thật sự nhận được, kể cả khi khách chuyển lệch.
    const now = new Date();
    const received = formatMoney(String(incoming.transferAmount));
    const requested = payment.amount;
    const metadata: Record<string, unknown> = payment.metadata || {};
    payment.amount = received;
    payment.status = PaymentTransactionStatus.SUCCEEDED;
    payment.providerTransactionId = incoming.sepayId;
    payment.completedAt = now;
    payment.metadata = {
      ...metadata,
      requestedAmount: metadata.requestedAmount ?? requested,
      receivedAmount: received,
      amountMismatch: received !== requested,
      lateArrival: Boolean(payment.expiresAt && payment.expiresAt < now),
      sepayId: incoming.sepayId,
      events: [
        ...((metadata.events as PaymentEvent[] | undefined) ?? []),
        this.event(
          'PAID',
          { sepayId: incoming.sepayId, amount: received },
          now,
        ),
      ],
    };
    await manager.save(PaymentTransaction, payment);
    await this.financeService.credit(manager, {
      accountId: payment.accountId,
      amount: received,
      currency: 'VND',
      purpose: 'DEPOSIT',
      idempotencyKey: `sepay:${incoming.sepayId}`,
      paymentTransactionId: payment.id,
      description: `Nạp SePay ${code}`,
    });
    return {
      status: SepayTransactionStatus.MATCHED,
      note:
        received !== requested
          ? `Yêu cầu ${requested}, nhận ${received}.`
          : undefined,
      paymentTransactionId: payment.id,
    };
  }

  private assertWebhookAuthorized(authorization?: string) {
    const expected = this.config.webhookApiKey;
    const [scheme, ...rest] = (authorization ?? '').trim().split(/\s+/);
    const provided = rest.join(' ');
    const ok =
      Boolean(expected) &&
      scheme.toLowerCase() === 'apikey' &&
      timingSafeEqual(this.digest(provided), this.digest(expected ?? ''));
    if (!ok) {
      throw new UnauthorizedException({
        success: false,
        data: null,
        message: 'Invalid SePay API key.',
        errorCode: 'INVALID_SEPAY_API_KEY',
      });
    }
  }

  // So sánh băm cố định độ dài để timingSafeEqual không lộ độ dài key.
  private digest(value: string) {
    return createHash('sha256').update(value).digest();
  }

  private sha256(value: string) {
    return createHash('sha256').update(value).digest('hex');
  }

  private async newPaymentCode(manager: EntityManager, prefix: string) {
    for (let attempt = 0; attempt < 5; attempt++) {
      let suffix = '';
      for (let i = 0; i < 8; i++) {
        suffix += CODE_ALPHABET[randomInt(CODE_ALPHABET.length)];
      }
      const code = `${prefix}${suffix}`;
      const taken = await manager.exists(PaymentTransaction, {
        where: { merchantReference: code },
      });
      if (!taken) return code;
    }
    throw new ConflictException('Could not allocate a payment code.');
  }

  private event(
    event: string,
    data: Record<string, unknown>,
    at = new Date(),
  ): PaymentEvent {
    return { at: at.toISOString(), event, ...data };
  }

  private serializeDeposit(payment: PaymentTransaction) {
    const metadata = payment.metadata || {};
    const bank = (metadata.bank ?? {}) as {
      bankCode?: string;
      accountNumber?: string;
      accountHolder?: string | null;
    };
    const requestedAmount =
      (metadata.requestedAmount as string | undefined) ?? payment.amount;
    const expired =
      payment.status === PaymentTransactionStatus.PENDING &&
      Boolean(payment.expiresAt && payment.expiresAt.getTime() < Date.now());
    const qr = new URLSearchParams({
      acc: bank.accountNumber ?? '',
      bank: bank.bankCode ?? '',
      amount: String(Math.round(Number(requestedAmount))),
      des: payment.merchantReference,
      template: 'compact',
    });
    return {
      id: payment.id,
      code: payment.merchantReference,
      status: payment.status,
      expired,
      requestedAmount,
      receivedAmount: (metadata.receivedAmount as string | undefined) ?? null,
      currency: payment.currency,
      bankCode: bank.bankCode ?? null,
      accountNumber: bank.accountNumber ?? null,
      accountHolder: bank.accountHolder ?? null,
      qrUrl: bank.accountNumber
        ? `https://vietqr.app/img?${qr.toString()}`
        : null,
      expiresAt: payment.expiresAt ?? null,
      completedAt: payment.completedAt ?? null,
      createdAt: payment.createdAt,
      events: (metadata.events as PaymentEvent[] | undefined) ?? [],
    };
  }

  private serializeSepay(row: SepayTransaction) {
    return {
      id: row.id,
      sepayId: row.sepayId,
      gateway: row.gateway,
      transactionDate: row.transactionDate,
      accountNumber: row.accountNumber,
      code: row.code,
      content: row.content,
      transferType: row.transferType,
      transferAmount: row.transferAmount,
      referenceCode: row.referenceCode,
      source: row.source,
      status: row.status,
      note: row.note,
      paymentTransactionId: row.paymentTransactionId,
      paymentAccountId: row.paymentTransaction?.accountId ?? null,
      resolvedBy: row.resolvedBy,
      resolvedAt: row.resolvedAt,
      createdAt: row.createdAt,
    };
  }
}
