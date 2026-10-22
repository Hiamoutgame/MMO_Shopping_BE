import { createServer, type Server } from 'http';
import { test, expect } from '../fixtures/auth.fixture';
import {
  expectEnvelope,
  expectErrorEnvelope,
  type ApiClient,
} from '../helpers/api-client';
import { dbQuery } from '../helpers/db';
import { idempotencyKey, walletBalance } from '../helpers/test-data';

/**
 * Nạp ví qua SePay (docs/business/wallet-sepay.md).
 * Server test chạy với SEPAY_WEBHOOK_API_KEY / SEPAY_ACCOUNT_NUMBER /
 * SEPAY_API_BASE_URL giả (xem .env.test hoặc .github/workflows/e2e.yml);
 * không gọi SePay thật.
 */

function env(key: string): string {
  const value = process.env[key];
  if (!value) throw new Error(`Missing ${key} (expected in .env.test)`);
  return value;
}

let nextSepayId = Date.now() * 10;
function sepayId(): number {
  return ++nextSepayId;
}

interface Deposit {
  id: string;
  code: string;
  status: string;
  requestedAmount: string;
  receivedAmount: string | null;
  qrUrl: string | null;
  accountNumber: string | null;
  expiresAt: string;
  events: { event: string }[];
}

async function createSepayDeposit(user: ApiClient, amount: string, key?: string) {
  const result = await user.post(
    'v1/wallet/sepay-deposits',
    { amount },
    { headers: { 'Idempotency-Key': key ?? idempotencyKey('sepay') } },
  );
  return expectEnvelope(result, 201).deposit as Deposit;
}

function webhookBody(overrides: Record<string, unknown> = {}) {
  return {
    id: sepayId(),
    gateway: 'MBBank',
    transactionDate: '2026-10-22 10:00:00',
    accountNumber: env('SEPAY_ACCOUNT_NUMBER'),
    subAccount: null,
    code: null,
    content: 'chuyen tien',
    transferType: 'in',
    transferAmount: 50000,
    accumulated: 0,
    referenceCode: 'FT' + Date.now(),
    description: '',
    ...overrides,
  };
}

function sendWebhook(
  anon: ApiClient,
  body: unknown,
  apiKey = env('SEPAY_WEBHOOK_API_KEY'),
) {
  return anon.post('v1/callbacks/sepay', body, {
    headers: { Authorization: `Apikey ${apiKey}` },
  });
}

async function ledgerFor(accountId: string) {
  return dbQuery<{ type: string; amount: string; idempotency_key: string }>(
    `SELECT t.type, t.amount, t.idempotency_key
       FROM wallet_transactions t JOIN wallets w ON w.id = t.wallet_id
      WHERE w.account_id = $1 ORDER BY t.created_at`,
    [accountId],
  );
}

test.describe('W. SePay wallet deposit', () => {
  test('creating a deposit returns transfer instructions and a QR', async ({
    userA,
  }) => {
    const deposit = await createSepayDeposit(userA.api, '50000');
    expect(deposit.code).toMatch(/^MMO[A-Z0-9]{8}$/);
    expect(deposit.status).toBe('PENDING');
    expect(deposit.requestedAmount).toBe('50000.0000');
    expect(deposit.accountNumber).toBe(env('SEPAY_ACCOUNT_NUMBER'));
    expect(deposit.qrUrl).toContain(`des=${deposit.code}`);
    expect(deposit.qrUrl).toContain('amount=50000');
    expect(new Date(deposit.expiresAt).getTime()).toBeGreaterThan(Date.now());

    const fetched = await userA.api.get(`v1/wallet/sepay-deposits/${deposit.id}`);
    expect(expectEnvelope(fetched, 200).deposit.code).toBe(deposit.code);
  });

  test('minimum deposit is 10,000 VND and amounts must be whole VND', async ({
    userA,
  }) => {
    const tooSmall = await userA.api.post(
      'v1/wallet/sepay-deposits',
      { amount: '9999' },
      { headers: { 'Idempotency-Key': idempotencyKey('min') } },
    );
    expectErrorEnvelope(tooSmall, 400, 'DEPOSIT_AMOUNT_TOO_SMALL');

    for (const amount of ['abc', '-10000', '0', '10000.5', '']) {
      const result = await userA.api.post(
        'v1/wallet/sepay-deposits',
        { amount },
        { headers: { 'Idempotency-Key': idempotencyKey('amt') } },
      );
      expect.soft(result.status, `amount=${amount}`).toBe(400);
    }

    // Không giới hạn mức tối đa.
    const big = await createSepayDeposit(userA.api, '500000000');
    expect(big.requestedAmount).toBe('500000000.0000');
  });

  test('same Idempotency-Key returns the same deposit', async ({ userA }) => {
    const key = idempotencyKey('same');
    const first = await createSepayDeposit(userA.api, '20000', key);
    const second = await createSepayDeposit(userA.api, '20000', key);
    expect(second.id).toBe(first.id);
    expect(second.code).toBe(first.code);
  });

  test('a matching webhook credits the wallet exactly once', async ({
    anon,
    userA,
  }) => {
    const deposit = await createSepayDeposit(userA.api, '50000');
    const body = webhookBody({
      content: `nap vi ${deposit.code} ck`,
      transferAmount: 50000,
    });

    const first = await sendWebhook(anon, body);
    expect(first.status).toBe(200);
    expect(first.body.success).toBe(true);
    expect(first.body.data).toMatchObject({ duplicate: false, status: 'MATCHED' });

    // SePay retry cùng id: không cộng thêm.
    const retry = await sendWebhook(anon, body);
    expect(retry.status).toBe(200);
    expect(retry.body.data).toMatchObject({ duplicate: true, status: 'MATCHED' });

    expect(await walletBalance(userA.api)).toBe('50000.0000');
    const ledger = await ledgerFor(userA.accountId);
    expect(ledger).toEqual([
      {
        type: 'CREDIT',
        amount: '50000.0000',
        idempotency_key: `sepay:${body.id}`,
      },
    ]);

    const fetched = expectEnvelope(
      await userA.api.get(`v1/wallet/sepay-deposits/${deposit.id}`),
      200,
    ).deposit as Deposit;
    expect(fetched.status).toBe('SUCCEEDED');
    expect(fetched.receivedAmount).toBe('50000.0000');
    expect(fetched.events.map((e) => e.event)).toEqual(['CREATED', 'PAID']);
  });

  test('concurrent duplicate webhooks credit once', async ({ anon, userA }) => {
    const deposit = await createSepayDeposit(userA.api, '30000');
    const body = webhookBody({ code: deposit.code, transferAmount: 30000 });
    const results = await Promise.all(
      Array.from({ length: 5 }, () => sendWebhook(anon, body)),
    );
    for (const result of results) expect(result.status).toBe(200);
    expect(results.filter((r) => r.body.data.duplicate === false)).toHaveLength(1);
    expect(await walletBalance(userA.api)).toBe('30000.0000');
  });

  test('a second transfer with the same code is held for admin, not credited', async ({
    anon,
    userA,
  }) => {
    const deposit = await createSepayDeposit(userA.api, '20000');
    const results = await Promise.all([
      sendWebhook(anon, webhookBody({ code: deposit.code, transferAmount: 20000 })),
      sendWebhook(anon, webhookBody({ code: deposit.code, transferAmount: 20000 })),
    ]);
    const statuses = results.map((r) => r.body.data.status).sort();
    expect(statuses).toEqual(['MATCHED', 'UNMATCHED']);
    expect(await walletBalance(userA.api)).toBe('20000.0000');
  });

  test('credits the amount actually received', async ({ anon, userA }) => {
    const deposit = await createSepayDeposit(userA.api, '100000');
    await sendWebhook(
      anon,
      webhookBody({ content: deposit.code, transferAmount: 90000 }),
    );
    expect(await walletBalance(userA.api)).toBe('90000.0000');
    const fetched = expectEnvelope(
      await userA.api.get(`v1/wallet/sepay-deposits/${deposit.id}`),
      200,
    ).deposit as Deposit;
    expect(fetched.requestedAmount).toBe('100000.0000');
    expect(fetched.receivedAmount).toBe('90000.0000');
  });

  test('rejects webhooks without the right API key and invalid payloads', async ({
    anon,
  }) => {
    const body = webhookBody();
    expectErrorEnvelope(
      await sendWebhook(anon, body, 'wrong-key'),
      401,
      'INVALID_SEPAY_API_KEY',
    );
    expectErrorEnvelope(
      await anon.post('v1/callbacks/sepay', body),
      401,
      'INVALID_SEPAY_API_KEY',
    );
    expectErrorEnvelope(
      await sendWebhook(anon, { id: 'x' }),
      400,
      'SEPAY_INVALID_PAYLOAD',
    );
    const [row] = await dbQuery(
      'SELECT 1 FROM sepay_transactions WHERE sepay_id = $1',
      [body.id],
    );
    expect(row).toBeUndefined();
  });

  test('outgoing transfers and unknown codes never touch wallets', async ({
    anon,
  }) => {
    const out = await sendWebhook(anon, webhookBody({ transferType: 'out' }));
    expect(out.body.data.status).toBe('IGNORED');
    const unknown = await sendWebhook(
      anon,
      webhookBody({ content: 'MMOZZZZ9999 khong ton tai' }),
    );
    expect(unknown.body.data.status).toBe('UNMATCHED');
    const noCode = await sendWebhook(anon, webhookBody({ content: 'tra no' }));
    expect(noCode.body.data.status).toBe('UNMATCHED');
  });

  test('the HMAC mock callback cannot complete SePay deposits', async ({
    anon,
    userA,
  }) => {
    const result = await anon.post('v1/callbacks/payment-providers/SEPAY', {
      merchantReference: 'MMOAAAAAAAA',
      providerTransactionId: 'x',
      amount: '10000',
      currency: 'VND',
      status: 'SUCCEEDED',
    });
    expect(result.status).toBe(400);
    const generic = await userA.api.post(
      'v1/deposits',
      { amount: '10000', provider: 'SEPAY' },
      { headers: { 'Idempotency-Key': idempotencyKey('generic') } },
    );
    expectErrorEnvelope(generic, 400, 'USE_SEPAY_DEPOSIT_ENDPOINT');
  });

  test('users only see their own deposits', async ({ userA, userB }) => {
    const deposit = await createSepayDeposit(userA.api, '10000');
    expect(
      (await userB.api.get(`v1/wallet/sepay-deposits/${deposit.id}`)).status,
    ).toBe(404);
    const list = expectEnvelope(
      await userB.api.get('v1/wallet/sepay-deposits'),
      200,
    );
    expect(list.items).toEqual([]);
  });
});

test.describe('W2. Admin SePay operations', () => {
  test('admin credits an unmatched transfer to a user, only once', async ({
    admin,
    anon,
    userA,
  }) => {
    const body = webhookBody({ content: 'quen ghi ma', transferAmount: 40000 });
    const received = await sendWebhook(anon, body);
    expect(received.body.data.status).toBe('UNMATCHED');
    const id = received.body.data.id as string;

    const forbidden = await userA.api.post(
      `v1/admin/sepay-transactions/${id}/resolve`,
      { action: 'IGNORE', note: 'x' },
    );
    expect(forbidden.status).toBe(403);

    const list = expectEnvelope(
      await admin.api.get('v1/admin/sepay-transactions', {
        params: { status: 'UNMATCHED', pageSize: 100 },
      }),
      200,
    );
    expect(list.items.map((item: { id: string }) => item.id)).toContain(id);

    const resolved = await admin.api.post(
      `v1/admin/sepay-transactions/${id}/resolve`,
      {
        action: 'CREDIT_ACCOUNT',
        accountEmail: userA.email,
        note: 'Khách gửi biên lai qua Zalo',
      },
    );
    expect(expectEnvelope(resolved, 200).sepayTransaction).toMatchObject({
      status: 'RESOLVED',
      paymentAccountId: userA.accountId,
    });
    expect(await walletBalance(userA.api)).toBe('40000.0000');

    const again = await admin.api.post(
      `v1/admin/sepay-transactions/${id}/resolve`,
      { action: 'CREDIT_ACCOUNT', accountId: userA.accountId, note: 'lan 2' },
    );
    expectErrorEnvelope(again, 409, 'SEPAY_TRANSACTION_NOT_UNMATCHED');
    expect(await walletBalance(userA.api)).toBe('40000.0000');
  });

  test('admin can ignore an unmatched transfer with a note', async ({
    admin,
    anon,
  }) => {
    const received = await sendWebhook(anon, webhookBody({ content: 'test' }));
    const id = received.body.data.id as string;
    const missingNote = await admin.api.post(
      `v1/admin/sepay-transactions/${id}/resolve`,
      { action: 'IGNORE' },
    );
    expect(missingNote.status).toBe(400);
    const ignored = await admin.api.post(
      `v1/admin/sepay-transactions/${id}/resolve`,
      { action: 'IGNORE', note: 'Tiền chuyển nội bộ' },
    );
    expect(expectEnvelope(ignored, 200).sepayTransaction).toMatchObject({
      status: 'IGNORED',
      resolvedBy: expect.any(String),
    });
  });

  test('reconcile pulls missed transactions from the SePay API', async ({
    admin,
    userA,
  }) => {
    const deposit = await createSepayDeposit(userA.api, '60000');
    const missedId = sepayId();
    const server = await startFakeSepayApi([
      {
        id: String(missedId),
        bank_brand_name: 'MBBank',
        account_number: env('SEPAY_ACCOUNT_NUMBER'),
        transaction_date: '2026-10-22 10:00:00',
        amount_out: '0.00',
        amount_in: '60000.00',
        accumulated: '0.00',
        transaction_content: `${deposit.code} nap vi`,
        reference_number: 'FT1',
        code: null,
      },
    ]);
    try {
      const first = expectEnvelope(
        await admin.api.post('v1/admin/sepay/reconcile'),
        200,
      );
      expect(first).toMatchObject({ fetched: 1, created: 1 });
      const second = expectEnvelope(
        await admin.api.post('v1/admin/sepay/reconcile'),
        200,
      );
      expect(second).toMatchObject({ fetched: 1, created: 0, duplicates: 1 });
    } finally {
      server.close();
    }
    expect(await walletBalance(userA.api)).toBe('60000.0000');
  });

  test('wallet audit finds no wallet whose balance differs from its ledger', async ({
    admin,
  }) => {
    const audit = expectEnvelope(
      await admin.api.get('v1/admin/wallet-audit'),
      200,
    );
    expect(audit.checkedWallets).toBeGreaterThan(0);
    expect(audit.mismatched).toEqual([]);
  });
});

// API giả của SePay tại SEPAY_API_BASE_URL (mặc định trong test là
// http://127.0.0.1:4599/userapi), kiểm tra luôn Bearer token.
function startFakeSepayApi(transactions: unknown[]): Promise<Server> {
  const base = new URL(env('SEPAY_API_BASE_URL'));
  const token = env('SEPAY_API_TOKEN');
  const server = createServer((req, res) => {
    const ok =
      req.url?.startsWith(`${base.pathname}/transactions/list`) &&
      req.headers.authorization === `Bearer ${token}`;
    res.writeHead(ok ? 200 : 401, { 'Content-Type': 'application/json' });
    res.end(
      JSON.stringify(
        ok
          ? { status: 200, messages: { success: true }, transactions }
          : { status: 401 },
      ),
    );
  });
  return new Promise((resolve) =>
    server.listen(Number(base.port), base.hostname, () => resolve(server)),
  );
}
