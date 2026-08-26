import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { randomUUID } from 'crypto';
import { DataSource, EntityManager, Repository } from 'typeorm';
import { CryptoService } from '../../../common/crypto/crypto.service';
import { formatMoney, money } from '../../../common/utils/money';
import { IdempotencyService } from '../../system/services/idempotency.service';
import { CreateDepositDto } from '../dto/create-deposit.dto';
import {
  PaymentCallbackDto,
  PaymentCallbackStatus,
} from '../dto/payment-callback.dto';
import {
  QueryPaymentTransactionsDto,
  QueryWalletLedgersDto,
} from '../dto/query-finance.dto';
import { PaymentTransaction } from '../entities/payment-transaction.entity';
import { WalletTransaction } from '../entities/wallet-transaction.entity';
import { Wallet } from '../entities/wallet.entity';
import { PaymentProvider } from '../enums/payment-provider.enum';
import { PaymentTransactionStatus } from '../enums/payment-transaction-status.enum';
import { PaymentType } from '../enums/payment-type.enum';
import { WalletTransactionStatus } from '../enums/wallet-transaction-status.enum';
import { WalletTransactionType } from '../enums/wallet-transaction-type.enum';

@Injectable()
export class FinanceService {
  constructor(
    @InjectRepository(Wallet)
    private readonly walletRepository: Repository<Wallet>,
    @InjectRepository(PaymentTransaction)
    private readonly paymentRepository: Repository<PaymentTransaction>,
    @InjectRepository(WalletTransaction)
    private readonly walletTransactionRepository: Repository<WalletTransaction>,
    private readonly dataSource: DataSource,
    private readonly idempotencyService: IdempotencyService,
    private readonly cryptoService: CryptoService,
  ) {}

  async getWallet(accountId: string) {
    const wallet = await this.ensureWallet(accountId);
    return { wallet: this.serializeWallet(wallet) };
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
    if (money(dto.amount).lte(0)) {
      throw new BadRequestException(
        'Deposit amount must be greater than zero.',
      );
    }

    return this.dataSource.transaction(async (manager) => {
      const requestHash = this.idempotencyService.hash(dto);
      const idempotency = await this.idempotencyService.begin(
        manager,
        'deposit',
        idempotencyKey,
        requestHash,
        accountId,
      );
      if (idempotency.state === 'REPLAY') {
        return idempotency.record.responseBody;
      }

      const wallet = await this.ensureWallet(accountId, manager);
      const payment = await manager.save(
        PaymentTransaction,
        manager.create(PaymentTransaction, {
          accountId,
          walletId: wallet.id,
          provider: dto.provider || PaymentProvider.BANK_TRANSFER,
          providerTransactionId: null,
          merchantReference: `DEP-${randomUUID()}`,
          type: PaymentType.DEPOSIT,
          amount: formatMoney(dto.amount),
          currency: (dto.currency || 'VND').toUpperCase(),
          status: PaymentTransactionStatus.PENDING,
          idempotencyKey,
          metadata: {
            adapter: 'BANK_TRANSFER_MOCK',
            instruction: 'Use callback endpoint to complete this deposit.',
          },
        }),
      );
      const response = { paymentTransaction: this.serializePayment(payment) };
      await this.idempotencyService.complete(
        manager,
        idempotency.record,
        response,
      );
      return response;
    });
  }

  async handlePaymentCallback(
    provider: PaymentProvider,
    dto: PaymentCallbackDto,
    rawBody: Buffer | string,
    timestamp?: string,
    signature?: string,
  ) {
    if (!this.cryptoService.verifyHmac(rawBody, timestamp, signature)) {
      throw new UnauthorizedException({
        success: false,
        data: null,
        message: 'Invalid payment callback signature.',
        errorCode: 'INVALID_SIGNATURE',
      });
    }

    return this.dataSource.transaction(async (manager) => {
      const requestHash = this.idempotencyService.hash(dto);
      const idempotency = await this.idempotencyService.begin(
        manager,
        `payment-callback:${provider}`,
        dto.providerTransactionId,
        requestHash,
        null,
      );
      if (idempotency.state === 'REPLAY') {
        return idempotency.record.responseBody;
      }

      const payment = await manager.findOne(PaymentTransaction, {
        where: { provider, merchantReference: dto.merchantReference },
        lock: { mode: 'pessimistic_write' },
      });
      if (!payment) {
        throw this.notFound('Payment transaction not found.');
      }
      if (
        payment.amount !== formatMoney(dto.amount) ||
        payment.currency !== dto.currency.toUpperCase()
      ) {
        throw new ConflictException({
          success: false,
          data: null,
          message: 'Payment callback amount or currency does not match.',
          errorCode: 'PAYMENT_MISMATCH',
        });
      }

      const existingProviderTx = await manager.findOne(PaymentTransaction, {
        where: { provider, providerTransactionId: dto.providerTransactionId },
      });
      if (existingProviderTx && existingProviderTx.id !== payment.id) {
        throw new ConflictException('Provider transaction already exists.');
      }

      payment.providerTransactionId = dto.providerTransactionId;
      payment.status =
        dto.status === PaymentCallbackStatus.SUCCEEDED
          ? PaymentTransactionStatus.SUCCEEDED
          : PaymentTransactionStatus.FAILED;
      payment.completedAt = new Date();
      payment.metadata = {
        ...(payment.metadata || {}),
        callback: dto.metadata || null,
      };
      await manager.save(PaymentTransaction, payment);

      if (payment.status === PaymentTransactionStatus.SUCCEEDED) {
        await this.credit(manager, {
          accountId: payment.accountId,
          amount: payment.amount,
          currency: payment.currency,
          purpose: 'DEPOSIT',
          idempotencyKey: `deposit:${payment.id}`,
          paymentTransactionId: payment.id,
          description: 'Wallet deposit',
        });
      }

      const response = { paymentTransaction: this.serializePayment(payment) };
      await this.idempotencyService.complete(
        manager,
        idempotency.record,
        response,
      );
      return response;
    });
  }

  async listWalletTransactions(
    accountId: string,
    query: QueryWalletLedgersDto,
  ) {
    const wallet = await this.ensureWallet(accountId);
    const page = query.page || 1;
    const pageSize = query.pageSize || 20;
    const [items, total] = await this.walletTransactionRepository.findAndCount({
      where: { walletId: wallet.id },
      order: { createdAt: 'DESC' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    });
    return this.paginated(
      items.map((item) => this.serializeLedger(item)),
      total,
      page,
      pageSize,
    );
  }

  async listPaymentTransactions(query: QueryPaymentTransactionsDto) {
    const page = query.page || 1;
    const pageSize = query.pageSize || 20;
    const qb = this.paymentRepository
      .createQueryBuilder('payment')
      .orderBy('payment.createdAt', 'DESC')
      .skip((page - 1) * pageSize)
      .take(pageSize);
    if (query.accountId) {
      qb.andWhere('payment.accountId = :accountId', {
        accountId: query.accountId,
      });
    }
    if (query.status) {
      qb.andWhere('payment.status = :status', { status: query.status });
    }
    const [items, total] = await qb.getManyAndCount();
    return this.paginated(
      items.map((item) => this.serializePayment(item)),
      total,
      page,
      pageSize,
    );
  }

  async getPaymentTransaction(id: string) {
    const payment = await this.paymentRepository.findOne({ where: { id } });
    if (!payment) {
      throw this.notFound('Payment transaction not found.');
    }
    return { paymentTransaction: this.serializePayment(payment) };
  }

  async listWalletLedgers(query: QueryWalletLedgersDto) {
    const page = query.page || 1;
    const pageSize = query.pageSize || 20;
    const qb = this.walletTransactionRepository
      .createQueryBuilder('ledger')
      .leftJoinAndSelect('ledger.wallet', 'wallet')
      .orderBy('ledger.createdAt', 'DESC')
      .skip((page - 1) * pageSize)
      .take(pageSize);
    if (query.accountId) {
      qb.andWhere('wallet.accountId = :accountId', {
        accountId: query.accountId,
      });
    }
    const [items, total] = await qb.getManyAndCount();
    return this.paginated(
      items.map((item) => this.serializeLedger(item)),
      total,
      page,
      pageSize,
    );
  }

  async debit(
    manager: EntityManager,
    input: {
      accountId: string;
      amount: string;
      currency: string;
      purpose: string;
      idempotencyKey: string;
      orderId?: string | null;
      description?: string | null;
    },
  ): Promise<WalletTransaction> {
    return this.moveBalance(manager, WalletTransactionType.DEBIT, input);
  }

  async credit(
    manager: EntityManager,
    input: {
      accountId: string;
      amount: string;
      currency: string;
      purpose: string;
      idempotencyKey: string;
      orderId?: string | null;
      paymentTransactionId?: string | null;
      description?: string | null;
    },
  ): Promise<WalletTransaction> {
    return this.moveBalance(manager, WalletTransactionType.CREDIT, input);
  }

  async refund(
    manager: EntityManager,
    input: {
      accountId: string;
      amount: string;
      currency: string;
      orderId: string;
      idempotencyKey: string;
      description?: string | null;
    },
  ): Promise<WalletTransaction> {
    return this.credit(manager, { ...input, purpose: 'REFUND' });
  }

  private async moveBalance(
    manager: EntityManager,
    type: WalletTransactionType,
    input: {
      accountId: string;
      amount: string;
      currency: string;
      purpose: string;
      idempotencyKey: string;
      orderId?: string | null;
      paymentTransactionId?: string | null;
      description?: string | null;
    },
  ) {
    const existing = await manager.findOne(WalletTransaction, {
      where: { idempotencyKey: input.idempotencyKey },
    });
    if (existing) {
      return existing;
    }

    const wallet = await this.ensureWallet(input.accountId, manager, true);
    if (wallet.currency !== input.currency.toUpperCase()) {
      throw new BadRequestException('Wallet currency mismatch.');
    }
    const amount = money(input.amount);
    const before = money(wallet.balance);
    const after =
      type === WalletTransactionType.CREDIT
        ? before.plus(amount)
        : before.minus(amount);
    if (after.lt(0)) {
      throw new BadRequestException({
        success: false,
        data: null,
        message: 'Wallet balance is insufficient.',
        errorCode: 'INSUFFICIENT_BALANCE',
      });
    }

    wallet.balance = formatMoney(after);
    await manager.save(Wallet, wallet);
    return manager.save(
      WalletTransaction,
      manager.create(WalletTransaction, {
        walletId: wallet.id,
        orderId: input.orderId || null,
        paymentTransactionId: input.paymentTransactionId || null,
        type,
        amount: formatMoney(amount),
        balanceBefore: formatMoney(before),
        balanceAfter: formatMoney(after),
        status: WalletTransactionStatus.COMPLETED,
        idempotencyKey: input.idempotencyKey,
        purpose: input.purpose,
        description: input.description || null,
      }),
    );
  }

  private async ensureWallet(
    accountId: string,
    manager?: EntityManager,
    lock = false,
  ): Promise<Wallet> {
    const repository = manager
      ? manager.getRepository(Wallet)
      : this.walletRepository;
    let wallet = await repository.findOne({
      where: { accountId },
      lock: lock ? { mode: 'pessimistic_write' } : undefined,
    });
    if (!wallet) {
      wallet = await repository.save(
        repository.create({ accountId, currency: 'VND', balance: '0' }),
      );
    }
    return wallet;
  }

  private serializeWallet(wallet: Wallet) {
    return {
      id: wallet.id,
      accountId: wallet.accountId,
      currency: wallet.currency,
      balance: wallet.balance,
      updatedAt: wallet.updatedAt,
    };
  }

  private serializePayment(payment: PaymentTransaction) {
    return {
      id: payment.id,
      accountId: payment.accountId,
      provider: payment.provider,
      merchantReference: payment.merchantReference,
      providerTransactionId: payment.providerTransactionId,
      type: payment.type,
      amount: payment.amount,
      currency: payment.currency,
      status: payment.status,
      metadata: payment.metadata,
      completedAt: payment.completedAt,
      createdAt: payment.createdAt,
    };
  }

  private serializeLedger(tx: WalletTransaction) {
    return {
      id: tx.id,
      walletId: tx.walletId,
      orderId: tx.orderId,
      paymentTransactionId: tx.paymentTransactionId,
      type: tx.type,
      amount: tx.amount,
      balanceBefore: tx.balanceBefore,
      balanceAfter: tx.balanceAfter,
      status: tx.status,
      purpose: tx.purpose,
      description: tx.description,
      createdAt: tx.createdAt,
    };
  }

  private paginated<T>(
    items: T[],
    total: number,
    page: number,
    pageSize: number,
  ) {
    return {
      items,
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
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
