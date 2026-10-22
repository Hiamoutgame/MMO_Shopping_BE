/**
 * Integration test trên PostgreSQL thật cho luồng nạp tiền SePay + ví.
 *
 * Chạy:  TEST_DATABASE_URL=postgresql://user:pass@host:5432/db npx jest deposit.integration
 * Không có TEST_DATABASE_URL thì cả suite được bỏ qua (CI unit vẫn xanh).
 * CẢNH BÁO: suite xóa toàn bộ schema public của database được trỏ tới.
 */
import { BadRequestException, ConflictException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'crypto';
import { readdirSync, statSync } from 'fs';
import { join } from 'path';
import { DataSource, EntitySchema } from 'typeorm';
import type { SepayConfig } from '../../../config/sepay.config';
import { CryptoService } from '../../../common/crypto/crypto.service';
import { Account } from '../../identity/entities/account.entity';
import { Role } from '../../identity/entities/role.entity';
import { AdminAuditLog } from '../../system/entities/admin-audit-log.entity';
import { IdempotencyRecord } from '../../system/entities/idempotency-record.entity';
import { AuditService } from '../../system/services/audit.service';
import { IdempotencyService } from '../../system/services/idempotency.service';
import { PaymentTransaction } from '../entities/payment-transaction.entity';
import { PaymentWebhookEvent } from '../entities/payment-webhook-event.entity';
import { WalletTransaction } from '../entities/wallet-transaction.entity';
import { Wallet } from '../entities/wallet.entity';
import { PaymentTransactionStatus } from '../enums/payment-transaction-status.enum';
import { PaymentWebhookEventStatus } from '../enums/payment-webhook-event-status.enum';
import { DepositService } from './deposit.service';
import { FinanceService } from './finance.service';
import { BankTransaction, SepayClientService } from './sepay-client.service';

const DATABASE_URL = process.env.TEST_DATABASE_URL;
const describeDb = DATABASE_URL ? describe : describe.skip;

const sepayConfig: SepayConfig = {
  webhookApiKey: 'it-webhook-key',
  apiToken: '',
  apiBaseUrl: 'https://my.sepay.vn',
  qrBaseUrl: 'https://qr.sepay.vn/img',
  bankCode: 'MBBank',
  accountNumber: '0123456789',
  accountHolder: 'TEST HOLDER',
  paymentPrefix: 'MMO',
  autoSyncIntervalMs: 0,
  depositMinAmount: 10000,
  depositMaxAmount: 1_000_000_000,
  depositExpiresMinutes: 30,
  maxPendingDeposits: 5,
};

/** Nạp mọi class export từ các file khớp đuôi trong cây thư mục. */
function loadClasses(root: string, suffix: RegExp): (Function | EntitySchema)[] {
  const found: (Function | EntitySchema)[] = [];
  for (const name of readdirSync(root)) {
    const full = join(root, name);
    if (statSync(full).isDirectory()) {
      found.push(...loadClasses(full, suffix));
    } else if (suffix.test(name) && !name.endsWith('.spec.ts')) {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const mod = require(full) as Record<string, unknown>;
      for (const value of Object.values(mod)) {
        if (typeof value === 'function') found.push(value);
      }
    }
  }
  return found;
}

describeDb('Deposit + wallet integration (real Postgres)', () => {
  let dataSource: DataSource;
  let finance: FinanceService;
  let deposits: DepositService;
  let sepay: SepayClientService;
  let roleId: string;
  let bankTxSeq = 1_000_000;

  const nextBankTx = (overrides: Partial<BankTransaction> = {}): BankTransaction => {
    const id = String(bankTxSeq++);
    return {
      providerEventId: id,
      transferType: 'in',
      amount: '50000.0000',
      code: null,
      content: null,
      referenceCode: `FT${id}`,
      accountNumber: sepayConfig.accountNumber,
      transactionDate: '2026-10-23 10:00:00',
      raw: { id: Number(id) },
      ...overrides,
    };
  };

  async function createAccount() {
    const account = await dataSource.getRepository(Account).save({
      roleId,
      email: `it-${randomUUID()}@example.com`,
      passwordHash: 'x',
      name: 'Integration User',
    });
    return account.id;
  }

  async function balanceOf(accountId: string) {
    const wallet = await dataSource
      .getRepository(Wallet)
      .findOneOrFail({ where: { accountId } });
    return wallet.balance;
  }

  async function ledgerCount(accountId: string) {
    const [row] = await dataSource.query<{ n: number }[]>(
      `SELECT COUNT(*)::int AS n FROM wallet_transactions wt
       JOIN wallets w ON w.id = wt.wallet_id WHERE w.account_id = $1`,
      [accountId],
    );
    return row.n;
  }

  async function newDeposit(accountId: string, amount = '50000') {
    const res = (await deposits.createDeposit(
      accountId,
      { amount },
      randomUUID(),
    )) as { deposit: { id: string; paymentCode: string } };
    return res.deposit;
  }

  beforeAll(async () => {
    const root = join(__dirname, '../../..');
    const reset = new DataSource({ type: 'postgres', url: DATABASE_URL });
    await reset.initialize();
    await reset.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
    await reset.destroy();

    dataSource = new DataSource({
      type: 'postgres',
      url: DATABASE_URL,
      entities: loadClasses(join(root, 'modules'), /\.entity\.ts$/),
      migrations: loadClasses(join(root, 'database/migrations'), /\.ts$/),
      migrationsRun: true,
      synchronize: false,
      extra: { max: 30 },
    });
    await dataSource.initialize();

    const role = await dataSource
      .getRepository(Role)
      .save({ code: 'USER', name: 'User' });
    roleId = role.id;

    sepay = new SepayClientService({
      get: () => sepayConfig,
    } as unknown as ConfigService);
    const idempotency = new IdempotencyService(
      dataSource.getRepository(IdempotencyRecord),
    );
    finance = new FinanceService(
      dataSource.getRepository(Wallet),
      dataSource.getRepository(PaymentTransaction),
      dataSource.getRepository(WalletTransaction),
      dataSource,
      idempotency,
      new CryptoService(),
    );
    deposits = new DepositService(
      dataSource.getRepository(PaymentTransaction),
      dataSource.getRepository(PaymentWebhookEvent),
      dataSource,
      finance,
      sepay,
      idempotency,
      new AuditService(dataSource.getRepository(AdminAuditLog)),
    );
  }, 120_000);

  afterAll(async () => {
    await dataSource?.destroy();
  });

  describe('create deposit', () => {
    it('rejects amounts below 10,000 VND', async () => {
      const accountId = await createAccount();
      await expect(
        deposits.createDeposit(accountId, { amount: '9999' }, randomUUID()),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('accepts exactly 10,000 VND and returns QR instructions', async () => {
      const accountId = await createAccount();
      const deposit = (await deposits.createDeposit(
        accountId,
        { amount: '10000' },
        randomUUID(),
      )) as {
        deposit: {
          paymentCode: string;
          status: string;
          instructions: { qrImageUrl: string; amount: string };
        };
      };
      expect(deposit.deposit.paymentCode).toMatch(/^MMO[A-Z0-9]{10}$/);
      expect(deposit.deposit.status).toBe('PENDING');
      expect(deposit.deposit.instructions.amount).toBe('10000');
      expect(deposit.deposit.instructions.qrImageUrl).toContain(
        deposit.deposit.paymentCode,
      );
    });

    it('replays the same response for a repeated Idempotency-Key', async () => {
      const accountId = await createAccount();
      const key = randomUUID();
      const first = await deposits.createDeposit(
        accountId,
        { amount: '20000' },
        key,
      );
      const second = await deposits.createDeposit(
        accountId,
        { amount: '20000' },
        key,
      );
      expect(second).toEqual(JSON.parse(JSON.stringify(first)));
      const count = await dataSource
        .getRepository(PaymentTransaction)
        .count({ where: { accountId } });
      expect(count).toBe(1);
    });

    it('limits open deposits per account', async () => {
      const accountId = await createAccount();
      for (let i = 0; i < sepayConfig.maxPendingDeposits; i++) {
        await newDeposit(accountId);
      }
      await expect(newDeposit(accountId)).rejects.toMatchObject({
        status: 429,
      });
    });
  });

  describe('bank transaction processing', () => {
    it('credits the wallet exactly once with a full ledger trail', async () => {
      const accountId = await createAccount();
      const deposit = await newDeposit(accountId, '50000');

      const outcome = await deposits.ingestBankTransaction(
        nextBankTx({ code: deposit.paymentCode, content: deposit.paymentCode }),
        'WEBHOOK',
      );
      expect(outcome).toMatchObject({
        status: PaymentWebhookEventStatus.PROCESSED,
        duplicate: false,
      });
      expect(await balanceOf(accountId)).toBe('50000.0000');

      const payment = await dataSource
        .getRepository(PaymentTransaction)
        .findOneOrFail({ where: { id: deposit.id } });
      expect(payment.status).toBe(PaymentTransactionStatus.SUCCEEDED);
      const ledger = await dataSource
        .getRepository(WalletTransaction)
        .findOneOrFail({ where: { paymentTransactionId: deposit.id } });
      expect(ledger).toMatchObject({
        type: 'CREDIT',
        amount: '50000.0000',
        balanceBefore: '0.0000',
        balanceAfter: '50000.0000',
      });
      const event = await dataSource
        .getRepository(PaymentWebhookEvent)
        .findOneOrFail({ where: { id: outcome.eventId } });
      expect(event.walletTransactionId).toBe(ledger.id);
      expect(event.paymentTransactionId).toBe(deposit.id);
    });

    it('credits once when SePay delivers the same webhook 10 times concurrently', async () => {
      const accountId = await createAccount();
      const deposit = await newDeposit(accountId, '100000');
      const tx = nextBankTx({
        amount: '100000.0000',
        content: `NAP ${deposit.paymentCode} FT123`,
      });

      const outcomes = await Promise.all(
        Array.from({ length: 10 }, () =>
          deposits.ingestBankTransaction({ ...tx }, 'WEBHOOK'),
        ),
      );

      expect(await balanceOf(accountId)).toBe('100000.0000');
      expect(await ledgerCount(accountId)).toBe(1);
      expect(new Set(outcomes.map((o) => o.eventId)).size).toBe(1);
      const event = await dataSource
        .getRepository(PaymentWebhookEvent)
        .findOneOrFail({ where: { id: outcomes[0].eventId } });
      expect(event.deliveryCount).toBe(10);
      expect(event.status).toBe(PaymentWebhookEventStatus.PROCESSED);
    });

    it('does not credit again when webhook and sync report the same transaction', async () => {
      const accountId = await createAccount();
      const deposit = await newDeposit(accountId, '30000');
      const tx = nextBankTx({
        amount: '30000.0000',
        code: deposit.paymentCode,
      });
      await deposits.ingestBankTransaction(tx, 'WEBHOOK');
      const replay = await deposits.ingestBankTransaction(tx, 'SYNC');
      expect(replay.duplicate).toBe(true);
      expect(await balanceOf(accountId)).toBe('30000.0000');
    });

    it('sends a second bank transfer with the same code to review', async () => {
      const accountId = await createAccount();
      const deposit = await newDeposit(accountId, '20000');
      await deposits.ingestBankTransaction(
        nextBankTx({ amount: '20000.0000', code: deposit.paymentCode }),
        'WEBHOOK',
      );
      const second = await deposits.ingestBankTransaction(
        nextBankTx({ amount: '20000.0000', code: deposit.paymentCode }),
        'WEBHOOK',
      );
      expect(second.status).toBe(PaymentWebhookEventStatus.NEEDS_REVIEW);
      expect(await balanceOf(accountId)).toBe('20000.0000');
    });

    it('credits the amount actually received when it differs from the request', async () => {
      const accountId = await createAccount();
      const deposit = await newDeposit(accountId, '100000');
      const outcome = await deposits.ingestBankTransaction(
        nextBankTx({ amount: '60000.0000', code: deposit.paymentCode }),
        'WEBHOOK',
      );
      expect(outcome.status).toBe(PaymentWebhookEventStatus.PROCESSED);
      expect(await balanceOf(accountId)).toBe('60000.0000');
      const { deposit: view } = await deposits.getMyDeposit(
        accountId,
        deposit.id,
      );
      expect(view.amount).toBe('60000.0000');
      expect(view.requestedAmount).toBe('100000.0000');
    });

    it('still credits a payment that arrives after the QR expired', async () => {
      const accountId = await createAccount();
      const deposit = await newDeposit(accountId, '15000');
      await dataSource.query(
        `UPDATE payment_transactions SET expires_at = now() - interval '1 hour' WHERE id = $1`,
        [deposit.id],
      );
      const outcome = await deposits.ingestBankTransaction(
        nextBankTx({ amount: '15000.0000', code: deposit.paymentCode }),
        'WEBHOOK',
      );
      expect(outcome.status).toBe(PaymentWebhookEventStatus.PROCESSED);
      expect(await balanceOf(accountId)).toBe('15000.0000');
      const event = await dataSource
        .getRepository(PaymentWebhookEvent)
        .findOneOrFail({ where: { id: outcome.eventId } });
      expect(event.reason).toContain('LATE_PAYMENT');
    });

    it.each([
      [
        'outgoing transfer',
        { transferType: 'out' },
        PaymentWebhookEventStatus.IGNORED,
        'OUTGOING',
      ],
      [
        'no payment code',
        { content: 'chuyen tien an trua' },
        PaymentWebhookEventStatus.IGNORED,
        'NO_CODE',
      ],
      [
        'unknown payment code',
        { code: 'MMOZZZZZZZZZZ' },
        PaymentWebhookEventStatus.NEEDS_REVIEW,
        'UNKNOWN_CODE',
      ],
      [
        'other bank account',
        { code: 'MMOZZZZZZZZZY', accountNumber: '999' },
        PaymentWebhookEventStatus.NEEDS_REVIEW,
        'UNKNOWN_BANK_ACCOUNT',
      ],
    ])('%s is recorded without touching any wallet', async (_, overrides, status, reason) => {
      const [{ total: before }] = await dataSource.query<{ total: string }[]>(
        'SELECT COALESCE(SUM(balance),0)::text AS total FROM wallets',
      );
      const outcome = await deposits.ingestBankTransaction(
        nextBankTx(overrides as Partial<BankTransaction>),
        'WEBHOOK',
      );
      expect(outcome.status).toBe(status);
      const event = await dataSource
        .getRepository(PaymentWebhookEvent)
        .findOneOrFail({ where: { id: outcome.eventId } });
      expect(event.reason).toBe(reason);
      const [{ total: after }] = await dataSource.query<{ total: string }[]>(
        'SELECT COALESCE(SUM(balance),0)::text AS total FROM wallets',
      );
      expect(after).toBe(before);
    });

    it('sends transfers below the minimum to review', async () => {
      const accountId = await createAccount();
      const deposit = await newDeposit(accountId, '10000');
      const outcome = await deposits.ingestBankTransaction(
        nextBankTx({ amount: '5000.0000', code: deposit.paymentCode }),
        'WEBHOOK',
      );
      expect(outcome.status).toBe(PaymentWebhookEventStatus.NEEDS_REVIEW);
      expect(await balanceOf(accountId)).toBe('0.0000');
    });
  });

  describe('admin review', () => {
    it('credits a reviewed event once even if two admins resolve concurrently', async () => {
      const adminId = await createAccount();
      const accountId = await createAccount();
      const outcome = await deposits.ingestBankTransaction(
        nextBankTx({ amount: '70000.0000', content: 'MMOTYPO000000 nap' }),
        'WEBHOOK',
      );
      expect(outcome.status).toBe(PaymentWebhookEventStatus.NEEDS_REVIEW);

      const attempts = await Promise.allSettled(
        [1, 2].map(() =>
          deposits.resolveEvent(adminId, outcome.eventId, {
            action: 'CREDIT',
            accountId,
            note: 'Khách gõ sai mã, đã xác minh qua chat',
          }),
        ),
      );
      expect(attempts.filter((a) => a.status === 'fulfilled')).toHaveLength(1);
      const rejected = attempts.find((a) => a.status === 'rejected');
      expect(rejected?.reason).toBeInstanceOf(ConflictException);
      expect(await balanceOf(accountId)).toBe('70000.0000');

      const audit = await dataSource
        .getRepository(AdminAuditLog)
        .find({ where: { targetId: outcome.eventId } });
      expect(audit).toHaveLength(1);
      expect(audit[0].action).toBe('PAYMENT_EVENT_CREDIT');
    });

    it('can ignore an event, which then cannot be ignored again', async () => {
      const adminId = await createAccount();
      const outcome = await deposits.ingestBankTransaction(
        nextBankTx({ code: 'MMOREFUNDED00' }),
        'WEBHOOK',
      );
      await deposits.resolveEvent(adminId, outcome.eventId, {
        action: 'IGNORE',
        note: 'Đã hoàn tiền thủ công cho người gửi',
      });
      await expect(
        deposits.resolveEvent(adminId, outcome.eventId, {
          action: 'IGNORE',
          note: 'again',
        }),
      ).rejects.toBeInstanceOf(ConflictException);
    });
  });

  describe('wallet ledger guarantees', () => {
    it('never overdraws under 20 concurrent debits', async () => {
      const accountId = await createAccount();
      const deposit = await newDeposit(accountId, '100000');
      await deposits.ingestBankTransaction(
        nextBankTx({ amount: '100000.0000', code: deposit.paymentCode }),
        'WEBHOOK',
      );

      const results = await Promise.allSettled(
        Array.from({ length: 20 }, (_, i) =>
          dataSource.transaction((manager) =>
            finance.debit(manager, {
              accountId,
              amount: '10000',
              currency: 'VND',
              purpose: 'ORDER_PAYMENT',
              idempotencyKey: `it-debit:${accountId}:${i}`,
            }),
          ),
        ),
      );
      expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(10);
      expect(await balanceOf(accountId)).toBe('0.0000');
      expect(await ledgerCount(accountId)).toBe(11);
    });

    it('debits once when the same idempotency key is retried concurrently', async () => {
      const accountId = await createAccount();
      const deposit = await newDeposit(accountId, '50000');
      await deposits.ingestBankTransaction(
        nextBankTx({ amount: '50000.0000', code: deposit.paymentCode }),
        'WEBHOOK',
      );
      const key = `it-same-debit:${accountId}`;
      const results = await Promise.all(
        Array.from({ length: 5 }, () =>
          dataSource.transaction((manager) =>
            finance.debit(manager, {
              accountId,
              amount: '10000',
              currency: 'VND',
              purpose: 'ORDER_PAYMENT',
              idempotencyKey: key,
            }),
          ),
        ),
      );
      expect(new Set(results.map((r) => r.id)).size).toBe(1);
      expect(await balanceOf(accountId)).toBe('40000.0000');
    });

    it('rejects ledger edits and inconsistent ledger rows at the database level', async () => {
      await expect(
        dataSource.query(`UPDATE wallet_transactions SET amount = amount + 1`),
      ).rejects.toThrow(/append-only/);
      await expect(
        dataSource.query(`DELETE FROM wallet_transactions`),
      ).rejects.toThrow(/append-only/);

      const [wallet] = await dataSource.query<{ id: string }[]>(
        'SELECT id FROM wallets LIMIT 1',
      );
      await expect(
        dataSource.query(
          `INSERT INTO wallet_transactions
            (wallet_id, type, amount, balance_before, balance_after, idempotency_key)
           VALUES ($1, 'CREDIT', 100, 0, 500, $2)`,
          [wallet.id, randomUUID()],
        ),
      ).rejects.toThrow(/chk_wallet_transactions_balance_math/);
    });

    it('reconciliation is clean, then flags a tampered balance', async () => {
      const clean = await finance.reconcile();
      expect(clean.walletMismatches).toEqual([]);
      expect(clean.paymentIssues).toEqual([]);
      expect(clean.orphanLedgers).toEqual([]);
      expect(clean.eventsWithoutLedger).toEqual([]);
      expect(clean.ok).toBe(true);

      const accountId = await createAccount();
      const deposit = await newDeposit(accountId, '10000');
      await deposits.ingestBankTransaction(
        nextBankTx({ amount: '10000.0000', code: deposit.paymentCode }),
        'WEBHOOK',
      );
      await dataSource.query(
        `UPDATE wallets SET balance = balance + 999 WHERE account_id = $1`,
        [accountId],
      );
      const dirty = await finance.reconcile();
      expect(dirty.ok).toBe(false);
      expect(dirty.walletMismatches).toEqual([
        expect.objectContaining({
          accountId,
          balance: '10999.0000',
          ledgerNet: '10000.0000',
        }),
      ]);
    });
  });
});
