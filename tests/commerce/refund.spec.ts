import { test, expect } from '../fixtures/auth.fixture';
import { expectEnvelope } from '../helpers/api-client';
import { dbQuery } from '../helpers/db';
import { placeOrder, refund } from '../helpers/orders';
import { idempotencyKey, randomId, walletBalance } from '../helpers/test-data';

async function refundCredits(orderId: string) {
  return dbQuery<{ amount: string }>(
    `SELECT amount FROM wallet_transactions
     WHERE order_id = $1 AND type = 'CREDIT' ORDER BY created_at`,
    [orderId],
  );
}

test.describe('D. Refunds', () => {
  test('full refund returns the whole amount and closes the order', async ({
    admin,
    anon,
    userA,
  }) => {
    const { order } = await placeOrder(admin.api, anon, userA.api, {
      price: '100000',
      quantity: 2,
    });
    expect(await walletBalance(userA.api)).toBe('0.0000');

    const result = await refund(admin.api, order.id);
    const refunded = expectEnvelope(result, 201).order;
    expect(refunded).toMatchObject({
      id: order.id,
      status: 'REFUNDED',
      paymentStatus: 'REFUNDED',
      totalAmount: '200000.0000',
      refundedAmount: '200000.0000',
    });
    expect(await walletBalance(userA.api)).toBe('200000.0000');
    expect(await refundCredits(order.id)).toEqual([{ amount: '200000.0000' }]);

    const ledger = expectEnvelope(
      await userA.api.get('v1/wallet-transactions'),
      200,
    );
    expect(ledger.items[0]).toMatchObject({
      type: 'CREDIT',
      purpose: 'REFUND',
      orderId: order.id,
      amount: '200000.0000',
      balanceBefore: '0.0000',
      balanceAfter: '200000.0000',
    });

    // Delivered goods are no longer exposed once the order is fully refunded.
    const own = expectEnvelope(await userA.api.get(`v1/orders/${order.id}`), 200);
    expect(own.order.status).toBe('REFUNDED');
    expect(own.order.items[0].deliveryPayload).toBeUndefined();

    // Nothing left to refund.
    const again = await refund(admin.api, order.id);
    expect(again.status).toBe(400);
    expect(await walletBalance(userA.api)).toBe('200000.0000');
  });

  test('partial refunds accumulate and the last one closes the order', async ({
    admin,
    anon,
    userA,
  }) => {
    const { order } = await placeOrder(admin.api, anon, userA.api, {
      price: '100000',
    });

    const first = expectEnvelope(
      await refund(admin.api, order.id, { amount: '30000.5' }),
      201,
    ).order;
    expect(first).toMatchObject({
      status: 'PARTIALLY_REFUNDED',
      paymentStatus: 'PAID',
      refundedAmount: '30000.5000',
      totalAmount: '100000.0000',
    });
    expect(await walletBalance(userA.api)).toBe('30000.5000');

    // Over the remaining 69999.5
    const tooMuch = await refund(admin.api, order.id, { amount: '69999.5001' });
    expect(tooMuch.status).toBe(400);
    expect(await walletBalance(userA.api)).toBe('30000.5000');

    const second = expectEnvelope(
      await refund(admin.api, order.id, { amount: '69999.5' }),
      201,
    ).order;
    expect(second).toMatchObject({
      status: 'REFUNDED',
      paymentStatus: 'REFUNDED',
      refundedAmount: '100000.0000',
    });
    expect(await walletBalance(userA.api)).toBe('100000.0000');
    expect(await refundCredits(order.id)).toEqual([
      { amount: '30000.5000' },
      { amount: '69999.5000' },
    ]);
  });

  test('refund amount must be positive, numeric and within the remaining balance', async ({
    admin,
    anon,
    userA,
  }) => {
    const { order } = await placeOrder(admin.api, anon, userA.api);
    for (const amount of ['0', '-1', '100000.0001', '999999999', 'abc', 5000]) {
      const result = await refund(admin.api, order.id, { amount });
      expect.soft(result.status, `amount=${String(amount)}`).toBe(400);
    }
    expect(await walletBalance(userA.api)).toBe('0.0000');
    expect(await refundCredits(order.id)).toEqual([]);

    const [row] = await dbQuery<{ status: string; refunded_amount: string }>(
      'SELECT status, refunded_amount FROM orders WHERE id = $1',
      [order.id],
    );
    expect(row).toEqual({ status: 'COMPLETED', refunded_amount: '0.0000' });
  });

  test('refund requires an Idempotency-Key and the ADMIN role', async ({
    admin,
    anon,
    userA,
    seller,
  }) => {
    const { order } = await placeOrder(admin.api, anon, userA.api);

    const noKey = await admin.api.post(`v1/admin/orders/${order.id}/refund`, {});
    expect(noKey.status).toBe(400);

    expect((await refund(anon, order.id)).status).toBe(401);
    // The buyer cannot refund their own order.
    expect((await refund(userA.api, order.id)).status).toBe(403);
    expect((await refund(seller.api, order.id)).status).toBe(403);

    expect((await refund(admin.api, randomId())).status).toBe(404);
    expect(await walletBalance(userA.api)).toBe('0.0000');
  });

  test('replaying a refund with the same Idempotency-Key does not pay twice', async ({
    admin,
    anon,
    userA,
  }) => {
    const { order } = await placeOrder(admin.api, anon, userA.api);
    const key = idempotencyKey('refund');

    const first = expectEnvelope(
      await refund(admin.api, order.id, { amount: '40000' }, key),
      201,
    );
    const replay = expectEnvelope(
      await refund(admin.api, order.id, { amount: '40000' }, key),
      201,
    );
    expect(replay).toEqual(first);
    expect(await walletBalance(userA.api)).toBe('40000.0000');
    expect(await refundCredits(order.id)).toEqual([{ amount: '40000.0000' }]);

    // Same key, different amount.
    const conflict = await refund(admin.api, order.id, { amount: '50000' }, key);
    expect(conflict.status).toBe(409);
    expect(await walletBalance(userA.api)).toBe('40000.0000');
  });

  test('concurrent full refunds pay out exactly once', async ({
    admin,
    anon,
    userA,
  }) => {
    const { order } = await placeOrder(admin.api, anon, userA.api);
    const results = await Promise.all([
      refund(admin.api, order.id),
      refund(admin.api, order.id),
      refund(admin.api, order.id),
    ]);
    expect(results.map((r) => r.status).sort()).toEqual([201, 400, 400]);
    expect(await walletBalance(userA.api)).toBe('100000.0000');
    expect(await refundCredits(order.id)).toEqual([{ amount: '100000.0000' }]);
  });

  test('concurrent partial refunds never exceed the order total', async ({
    admin,
    anon,
    userA,
  }) => {
    const { order } = await placeOrder(admin.api, anon, userA.api);
    const results = await Promise.all(
      [1, 2, 3, 4].map(() => refund(admin.api, order.id, { amount: '40000' })),
    );
    // 4 x 40000 > 100000: only two can succeed.
    expect(results.filter((r) => r.status === 201)).toHaveLength(2);
    expect(results.filter((r) => r.status === 400)).toHaveLength(2);

    expect(await walletBalance(userA.api)).toBe('80000.0000');
    const [row] = await dbQuery<{
      status: string;
      payment_status: string;
      refunded_amount: string;
    }>(
      'SELECT status, payment_status, refunded_amount FROM orders WHERE id = $1',
      [order.id],
    );
    expect(row).toEqual({
      status: 'PARTIALLY_REFUNDED',
      payment_status: 'PAID',
      refunded_amount: '80000.0000',
    });
  });

  test('BUG-013: an Idempotency-Key used for one order must not short-circuit a refund of another order', async ({
    admin,
    anon,
    userA,
    userB,
  }) => {
    const first = await placeOrder(admin.api, anon, userA.api);
    const second = await placeOrder(admin.api, anon, userB.api);
    const key = idempotencyKey('shared-refund');

    expectEnvelope(await refund(admin.api, first.order.id, {}, key), 201);
    expect(await walletBalance(userA.api)).toBe('100000.0000');

    const other = await refund(admin.api, second.order.id, {}, key);
    // Either the key is scoped per order (refund happens) or it is a conflict.
    // Silently replaying the first order's response is not acceptable.
    if (other.status === 201) {
      expect(other.body.data.order.id).toBe(second.order.id);
      expect(await walletBalance(userB.api)).toBe('100000.0000');
    } else {
      expect(other.status).toBe(409);
      expect(await walletBalance(userB.api)).toBe('0.0000');
    }
  });

  test('BUG-012: order status changes follow a state machine', async ({
    admin,
    anon,
    userA,
  }) => {
    const { order } = await placeOrder(admin.api, anon, userA.api);
    expectEnvelope(await refund(admin.api, order.id), 201);

    // A fully refunded order cannot be flipped back to COMPLETED.
    const reopen = await admin.api.patch(`v1/admin/orders/${order.id}/status`, {
      status: 'COMPLETED',
    });
    expect.soft(reopen.status, 'REFUNDED -> COMPLETED').toBe(400);

    const [row] = await dbQuery<{ status: string; payment_status: string }>(
      'SELECT status, payment_status FROM orders WHERE id = $1',
      [order.id],
    );
    expect(row).toEqual({ status: 'REFUNDED', payment_status: 'REFUNDED' });
  });

  test('BUG-012: admin cannot mark a paid order REFUNDED without refunding money', async ({
    admin,
    anon,
    userA,
  }) => {
    const { order } = await placeOrder(admin.api, anon, userA.api);
    const result = await admin.api.patch(`v1/admin/orders/${order.id}/status`, {
      status: 'REFUNDED',
    });
    expect.soft(result.status, 'COMPLETED -> REFUNDED via status API').toBe(400);

    const [row] = await dbQuery<{
      status: string;
      payment_status: string;
      refunded_amount: string;
    }>(
      'SELECT status, payment_status, refunded_amount FROM orders WHERE id = $1',
      [order.id],
    );
    // status, payment status and refunded amount must stay consistent
    const consistent =
      (row.status === 'REFUNDED') === (row.payment_status === 'REFUNDED') &&
      (row.status === 'REFUNDED') === (row.refunded_amount === '100000.0000');
    expect(consistent, JSON.stringify(row)).toBe(true);
    expect(await walletBalance(userA.api)).toBe('0.0000');
  });
});
