import {
  BadRequestException,
  ConflictException,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { randomUUID } from 'crypto';
import { DataSource, EntityManager, Repository } from 'typeorm';
import { formatMoney, money } from '../../../common/utils/money';
import { Account } from '../../identity/entities/account.entity';
import { AuditService } from '../../system/services/audit.service';
import { IdempotencyService } from '../../system/services/idempotency.service';
import { CreateDepositDto } from '../dto/create-deposit.dto';
import {
  QueryPaymentWebhookEventsDto,
  ResolvePaymentWebhookEventDto,
} from '../dto/payment-webhook-event.dto';
import { PaginationQueryDto } from '../../../common/dto/pagination-query.dto';
import { PaymentTransaction } from '../entities/payment-transaction.entity';
import { PaymentWebhookEvent } from '../entities/payment-webhook-event.entity';
import { PaymentProvider } from '../enums/payment-provider.enum';
import { PaymentTransactionStatus } from '../enums/payment-transaction-status.enum';
import { PaymentType } from '../enums/payment-type.enum';
import { PaymentWebhookEventStatus } from '../enums/payment-webhook-event-status.enum';
import { FinanceService } from './finance.service';
import { BankTransaction, SepayClientService } from './sepay-client.service';

export type IngestOutcome = {
  eventId: string;
  status: PaymentWebhookEventStatus;
  duplicate: boolean;
};

type EventDecision =
  | { status: PaymentWebhookEventStatus.IGNORED; reason: string }
  | { status: PaymentWebhookEventStatus.NEEDS_REVIEW; reason: string }
  | { status: PaymentWebhookEventStatus.PROCESSED; reason: string | null };

/**
 * Luồng nạp tiền qua chuyển khoản SePay.
 *
 * Bất biến cần giữ (xem docs/business/sepay-deposit.md):
 * 1. Một giao dịch ngân hàng (provider_event_id) chỉ được ghi nhận một lần.
 * 2. Một payment chỉ sinh tối đa một dòng ledger (idempotency `deposit:<id>`).
 * 3. Mọi thay đổi tiền đi qua FinanceService.credit trong cùng DB transaction
 *    với việc đổi trạng thái payment/event.
 */
@Injectable()
export class DepositService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(DepositService.name);
  private syncTimer: NodeJS.Timeout | null = null;
  private syncRunning = false;

  constructor(
    @InjectRepository(PaymentTransaction)
    private readonly paymentRepository: Repository<PaymentTransaction>,
    @InjectRepository(PaymentWebhookEvent)
    private readonly eventRepository: Repository<PaymentWebhookEvent>,
    private readonly dataSource: DataSource,
    private readonly financeService: FinanceService,
    private readonly sepay: SepayClientService,
    private readonly idempotencyService: IdempotencyService,
    private readonly auditService: AuditService,
  ) {}

  onModuleInit() {
    const interval = this.sepay.config.autoSyncIntervalMs;
    if (
      process.env.NODE_ENV === 'test' ||
      interval <= 0 ||
      !this.sepay.config.apiToken
    ) {
      return;
    }
    this.syncTimer = setInterval(() => {
      void this.autoSync();
    }, interval);
    this.syncTimer.unref();
    this.logger.log(`SePay auto sync every ${interval}ms`);
  }

  onModuleDestroy() {
    if (this.syncTimer) clearInterval(this.syncTimer);
  }

  getConfig() {
    const config = this.sepay.config;
    return {
      enabled: this.sepay.isDepositConfigured(),
      minAmount: String(config.depositMinAmount),
      maxAmount: String(config.depositMaxAmount),
      expiresMinutes: config.depositExpiresMinutes,
      currency: 'VND',
    };
  }

  async createDeposit(
    accountId: string,
    dto: CreateDepositDto,
    idempotencyKey?: string,
  ) {
    if (!idempotencyKey) {
      throw new BadRequestException({
        success: false,
        data: null,
        message: 'Idempotency-Key header is required.',
        errorCode: 'IDEMPOTENCY_KEY_REQUIRED',
      });
    }
    this.sepay.assertDepositConfigured();
    const config = this.sepay.config;
    const amount = money(dto.amount);
    if (
      amount.lt(config.depositMinAmount) ||
      amount.gt(config.depositMaxAmount)
    ) {
      throw new BadRequestException({
        success: false,
        data: null,
        message: `Số tiền nạp phải từ ${config.depositMinAmount} đến ${config.depositMaxAmount} VND.`,
        errorCode: 'DEPOSIT_AMOUNT_OUT_OF_RANGE',
      });
    }

    return this.dataSource.transaction(async (manager) => {
      const idempotency = await this.idempotencyService.begin(
        manager,
        'deposit',
        idempotencyKey,
        this.idempotencyService.hash(dto),
        accountId,
      );
      if (idempotency.state === 'REPLAY') {
        return idempotency.record.responseBody;
      }

      const openDeposits = await manager
        .createQueryBuilder(PaymentTransaction, 'payment')
        .where('payment.accountId = :accountId', { accountId })
        .andWhere('payment.provider = :provider', {
          provider: PaymentProvider.SEPAY,
        })
        .andWhere('payment.status = :status', {
          status: PaymentTransactionStatus.PENDING,
        })
        .andWhere('payment.expiresAt > now()')
        .getCount();
      if (openDeposits >= config.maxPendingDeposits) {
        throw new HttpException(
          {
            success: false,
            data: null,
            message:
              'Bạn đang có quá nhiều yêu cầu nạp chưa thanh toán. Hãy dùng lại yêu cầu cũ hoặc chờ hết hạn.',
            errorCode: 'TOO_MANY_PENDING_DEPOSITS',
          },
          HttpStatus.TOO_MANY_REQUESTS,
        );
      }

      const wallet = await this.financeService.getOrCreateWallet(
        accountId,
        manager,
      );
      const payment = await manager.save(
        PaymentTransaction,
        manager.create(PaymentTransaction, {
          accountId,
          walletId: wallet.id,
          provider: PaymentProvider.SEPAY,
          providerTransactionId: null,
          merchantReference: this.sepay.generatePaymentCode(),
          type: PaymentType.DEPOSIT,
          amount: formatMoney(amount),
          currency: 'VND',
          status: PaymentTransactionStatus.PENDING,
          idempotencyKey: `${accountId}:${idempotencyKey}`,
          expiresAt: new Date(
            Date.now() + config.depositExpiresMinutes * 60_000,
          ),
          metadata: { requestedAmount: formatMoney(amount) },
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

  async listMyDeposits(accountId: string, query: PaginationQueryDto) {
    const page = query.page || 1;
    const pageSize = query.pageSize || 20;
    const [items, total] = await this.paymentRepository.findAndCount({
      where: { accountId, type: PaymentType.DEPOSIT },
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

  async getMyDeposit(accountId: string, id: string) {
    const payment = await this.paymentRepository.findOne({
      where: { id, accountId, type: PaymentType.DEPOSIT },
    });
    if (!payment) throw this.notFound('Deposit not found.');
    return { deposit: this.serializeDeposit(payment) };
  }

  /**
   * Điểm vào duy nhất cho mọi giao dịch ngân hàng (webhook + sync).
   * Bước 1 ghi/đếm sự kiện ngoài transaction để luôn còn dấu vết kể cả khi
   * bước 2 lỗi; bước 2 khóa sự kiện rồi mới xử lý tiền.
   */
  async ingestBankTransaction(
    tx: BankTransaction,
    source: 'WEBHOOK' | 'SYNC',
  ): Promise<IngestOutcome> {
    const recorded = await this.recordEvent(tx, source);
    if (recorded.status !== PaymentWebhookEventStatus.RECEIVED) {
      return { eventId: recorded.id, status: recorded.status, duplicate: true };
    }
    const event = await this.dataSource.transaction((manager) =>
      this.processEvent(manager, recorded.id),
    );
    return {
      eventId: event.id,
      status: event.status,
      duplicate: recorded.deliveryCount > 1,
    };
  }

  async syncFromSepay(sinceHours = 24) {
    const transactions = await this.sepay.fetchRecentTransactions(sinceHours);
    const candidates = transactions.filter(
      (tx) =>
        tx.transferType === 'in' &&
        this.sepay.looksLikeShopTransfer(tx.code, tx.content),
    );
    const summary = {
      fetched: transactions.length,
      candidates: candidates.length,
      newlyProcessed: 0,
      needsReview: 0,
      alreadyRecorded: 0,
    };
    for (const tx of candidates) {
      const outcome = await this.ingestBankTransaction(tx, 'SYNC');
      if (outcome.duplicate) summary.alreadyRecorded++;
      else if (outcome.status === PaymentWebhookEventStatus.PROCESSED) {
        summary.newlyProcessed++;
      } else if (outcome.status === PaymentWebhookEventStatus.NEEDS_REVIEW) {
        summary.needsReview++;
      }
    }
    return summary;
  }

  async listEvents(query: QueryPaymentWebhookEventsDto) {
    const page = query.page || 1;
    const pageSize = query.pageSize || 20;
    const qb = this.eventRepository
      .createQueryBuilder('event')
      .orderBy('event.createdAt', 'DESC')
      .skip((page - 1) * pageSize)
      .take(pageSize);
    if (query.status) {
      qb.andWhere('event.status = :status', { status: query.status });
    }
    if (query.search) {
      qb.andWhere(
        '(event.paymentCode ILIKE :search OR event.referenceCode ILIKE :search OR event.content ILIKE :search OR event.providerEventId = :exact)',
        { search: `%${query.search}%`, exact: query.search },
      );
    }
    const [items, total] = await qb.getManyAndCount();
    return {
      items: items.map((item) => this.serializeEvent(item)),
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
    };
  }

  async getEvent(id: string) {
    const event = await this.eventRepository.findOne({ where: { id } });
    if (!event) throw this.notFound('Payment webhook event not found.');
    return { event: this.serializeEvent(event, true) };
  }

  /**
   * Admin xử lý giao dịch cần xem xét: cộng tiền cho đúng tài khoản hoặc bỏ qua.
   * Khóa sự kiện nên hai admin bấm cùng lúc cũng chỉ một người thành công.
   */
  async resolveEvent(
    adminAccountId: string,
    id: string,
    dto: ResolvePaymentWebhookEventDto,
    ipAddress?: string | null,
  ) {
    return this.dataSource.transaction(async (manager) => {
      const event = await manager.findOne(PaymentWebhookEvent, {
        where: { id },
        lock: { mode: 'pessimistic_write' },
      });
      if (!event) throw this.notFound('Payment webhook event not found.');
      const resolvable =
        event.status === PaymentWebhookEventStatus.NEEDS_REVIEW ||
        (event.status === PaymentWebhookEventStatus.IGNORED &&
          event.transferType === 'in' &&
          dto.action === 'CREDIT');
      if (!resolvable) {
        throw new ConflictException({
          success: false,
          data: null,
          message: `Event in status ${event.status} cannot be resolved.`,
          errorCode: 'EVENT_NOT_RESOLVABLE',
        });
      }

      const previousStatus = event.status;
      event.note = dto.note;
      event.resolvedBy = adminAccountId;
      event.processedAt = new Date();

      if (dto.action === 'IGNORE') {
        event.status = PaymentWebhookEventStatus.IGNORED;
        event.reason = 'ADMIN_IGNORED';
      } else {
        const account = await manager.findOne(Account, {
          where: { id: dto.accountId! },
        });
        if (!account) throw this.notFound('Account not found.');
        const wallet = await this.financeService.getOrCreateWallet(
          account.id,
          manager,
        );
        const payment = await manager.save(
          PaymentTransaction,
          manager.create(PaymentTransaction, {
            accountId: account.id,
            walletId: wallet.id,
            provider: event.provider,
            providerTransactionId: event.providerEventId,
            merchantReference: `REVIEW-${randomUUID()}`,
            type: PaymentType.DEPOSIT,
            amount: event.amount,
            currency: 'VND',
            status: PaymentTransactionStatus.SUCCEEDED,
            idempotencyKey: `review:${event.id}`,
            completedAt: new Date(),
            metadata: {
              resolvedBy: adminAccountId,
              webhookEventId: event.id,
              originalReason: event.reason,
              note: dto.note,
            },
          }),
        );
        const ledger = await this.financeService.credit(manager, {
          accountId: account.id,
          amount: event.amount,
          currency: 'VND',
          purpose: 'DEPOSIT',
          idempotencyKey: `deposit:${payment.id}`,
          paymentTransactionId: payment.id,
          description: `Admin duyệt giao dịch SePay #${event.providerEventId}`,
        });
        event.status = PaymentWebhookEventStatus.RESOLVED;
        event.paymentTransactionId = payment.id;
        event.walletTransactionId = ledger.id;
      }

      await manager.save(PaymentWebhookEvent, event);
      await this.auditService.log({
        manager,
        adminAccountId,
        action: `PAYMENT_EVENT_${dto.action}`,
        targetType: 'PAYMENT_WEBHOOK_EVENT',
        targetId: event.id,
        metadata: {
          previousStatus,
          newStatus: event.status,
          amount: event.amount,
          providerEventId: event.providerEventId,
          accountId: dto.accountId ?? null,
          note: dto.note,
        },
        ipAddress: ipAddress ?? null,
      });
      return { event: this.serializeEvent(event, true) };
    });
  }

  /** Ghi sự kiện; nếu đã có thì chỉ tăng delivery_count (dấu vết retry). */
  private async recordEvent(
    tx: BankTransaction,
    source: 'WEBHOOK' | 'SYNC',
  ): Promise<{
    id: string;
    status: PaymentWebhookEventStatus;
    deliveryCount: number;
  }> {
    const rows = await this.dataSource.query<
      {
        id: string;
        status: PaymentWebhookEventStatus;
        delivery_count: number;
      }[]
    >(
      `
      INSERT INTO "payment_webhook_events" (
        "provider", "provider_event_id", "source", "transfer_type", "amount",
        "payment_code", "content", "reference_code", "account_number",
        "transaction_date", "raw_payload"
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
      ON CONFLICT ("provider", "provider_event_id") DO UPDATE SET
        "delivery_count" = "payment_webhook_events"."delivery_count" + 1,
        "last_received_at" = now()
      RETURNING "id", "status", "delivery_count"
      `,
      [
        PaymentProvider.SEPAY,
        tx.providerEventId,
        source,
        tx.transferType,
        tx.amount,
        this.sepay.extractPaymentCode(tx.code, tx.content) ?? tx.code,
        tx.content,
        tx.referenceCode,
        tx.accountNumber,
        tx.transactionDate,
        JSON.stringify(tx.raw),
      ],
    );
    return {
      id: rows[0].id,
      status: rows[0].status,
      deliveryCount: Number(rows[0].delivery_count),
    };
  }

  private async processEvent(
    manager: EntityManager,
    eventId: string,
  ): Promise<PaymentWebhookEvent> {
    const event = await manager.findOneOrFail(PaymentWebhookEvent, {
      where: { id: eventId },
      lock: { mode: 'pessimistic_write' },
    });
    if (event.status !== PaymentWebhookEventStatus.RECEIVED) {
      return event;
    }

    const decision = await this.decide(manager, event);
    event.status = decision.status;
    event.reason = decision.reason;
    event.processedAt = new Date();
    await manager.save(PaymentWebhookEvent, event);
    if (decision.status !== PaymentWebhookEventStatus.PROCESSED) {
      this.logger.warn(
        `SePay event ${event.providerEventId} -> ${decision.status} (${decision.reason})`,
      );
    }
    return event;
  }

  private async decide(
    manager: EntityManager,
    event: PaymentWebhookEvent,
  ): Promise<EventDecision> {
    const config = this.sepay.config;
    if (event.transferType !== 'in') {
      return { status: PaymentWebhookEventStatus.IGNORED, reason: 'OUTGOING' };
    }
    if (
      config.accountNumber &&
      event.accountNumber &&
      event.accountNumber !== config.accountNumber
    ) {
      return {
        status: PaymentWebhookEventStatus.NEEDS_REVIEW,
        reason: 'UNKNOWN_BANK_ACCOUNT',
      };
    }
    const code = this.sepay.extractPaymentCode(
      event.paymentCode ?? null,
      event.content ?? null,
    );
    if (!code) {
      return { status: PaymentWebhookEventStatus.IGNORED, reason: 'NO_CODE' };
    }

    const payment = await manager.findOne(PaymentTransaction, {
      where: { provider: PaymentProvider.SEPAY, merchantReference: code },
      lock: { mode: 'pessimistic_write' },
    });
    if (!payment) {
      return {
        status: PaymentWebhookEventStatus.NEEDS_REVIEW,
        reason: 'UNKNOWN_CODE',
      };
    }
    event.paymentTransactionId = payment.id;
    if (payment.status === PaymentTransactionStatus.SUCCEEDED) {
      return {
        status: PaymentWebhookEventStatus.NEEDS_REVIEW,
        reason: 'PAYMENT_ALREADY_COMPLETED',
      };
    }
    if (money(event.amount).lt(config.depositMinAmount)) {
      return {
        status: PaymentWebhookEventStatus.NEEDS_REVIEW,
        reason: 'BELOW_MINIMUM',
      };
    }

    const amountMismatch = !money(event.amount).eq(payment.amount);
    const late = Boolean(payment.expiresAt && payment.expiresAt < new Date());
    payment.metadata = {
      ...(payment.metadata || {}),
      requestedAmount:
        (payment.metadata?.requestedAmount as string | undefined) ??
        payment.amount,
      receivedAmount: event.amount,
      webhookEventId: event.id,
      referenceCode: event.referenceCode,
      late,
    };
    // Ghi nhận đúng số tiền thực nhận: tiền đã vào tài khoản shop.
    payment.amount = event.amount;
    payment.providerTransactionId = event.providerEventId;
    payment.status = PaymentTransactionStatus.SUCCEEDED;
    payment.completedAt = new Date();
    await manager.save(PaymentTransaction, payment);

    const ledger = await this.financeService.credit(manager, {
      accountId: payment.accountId,
      amount: event.amount,
      currency: payment.currency,
      purpose: 'DEPOSIT',
      idempotencyKey: `deposit:${payment.id}`,
      paymentTransactionId: payment.id,
      description: `Nạp tiền SePay ${code}`,
    });
    event.walletTransactionId = ledger.id;

    const notes = [amountMismatch && 'AMOUNT_MISMATCH', late && 'LATE_PAYMENT']
      .filter(Boolean)
      .join(',');
    return {
      status: PaymentWebhookEventStatus.PROCESSED,
      reason: notes || null,
    };
  }

  private async autoSync() {
    if (this.syncRunning) return;
    this.syncRunning = true;
    try {
      const summary = await this.syncFromSepay(2);
      if (summary.newlyProcessed || summary.needsReview) {
        this.logger.warn(
          `SePay auto sync caught missed transactions: ${JSON.stringify(summary)}`,
        );
      }
    } catch (error) {
      this.logger.error(`SePay auto sync failed: ${String(error)}`);
    } finally {
      this.syncRunning = false;
    }
  }

  private serializeDeposit(payment: PaymentTransaction) {
    const isPending = payment.status === PaymentTransactionStatus.PENDING;
    const isExpired = Boolean(
      isPending && payment.expiresAt && payment.expiresAt < new Date(),
    );
    const metadata = (payment.metadata || {}) as Record<string, unknown>;
    return {
      id: payment.id,
      provider: payment.provider,
      paymentCode: payment.merchantReference,
      amount: payment.amount,
      requestedAmount:
        (metadata.requestedAmount as string | undefined) ?? payment.amount,
      currency: payment.currency,
      status: payment.status,
      isExpired,
      expiresAt: payment.expiresAt ?? null,
      completedAt: payment.completedAt ?? null,
      createdAt: payment.createdAt,
      instructions:
        isPending && payment.provider === PaymentProvider.SEPAY
          ? this.sepay.buildInstructions(
              payment.merchantReference,
              payment.amount,
            )
          : null,
    };
  }

  private serializeEvent(event: PaymentWebhookEvent, withRaw = false) {
    return {
      id: event.id,
      provider: event.provider,
      providerEventId: event.providerEventId,
      source: event.source,
      status: event.status,
      reason: event.reason ?? null,
      note: event.note ?? null,
      transferType: event.transferType,
      amount: event.amount,
      paymentCode: event.paymentCode ?? null,
      content: event.content ?? null,
      referenceCode: event.referenceCode ?? null,
      accountNumber: event.accountNumber ?? null,
      transactionDate: event.transactionDate ?? null,
      deliveryCount: event.deliveryCount,
      paymentTransactionId: event.paymentTransactionId ?? null,
      walletTransactionId: event.walletTransactionId ?? null,
      resolvedBy: event.resolvedBy ?? null,
      processedAt: event.processedAt ?? null,
      lastReceivedAt: event.lastReceivedAt,
      createdAt: event.createdAt,
      ...(withRaw ? { rawPayload: event.rawPayload } : {}),
    };
  }

  private notFound(message: string) {
    return new NotFoundException({
      success: false,
      data: null,
      message,
      errorCode: 'NOT_FOUND',
    });
  }
}
