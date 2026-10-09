import { test, expect } from '../fixtures/auth.fixture';
import { expectEnvelope, unwrap, type ApiClient } from '../helpers/api-client';
import { dbQuery } from '../helpers/db';
import {
  DAY,
  HOUR,
  addToCart,
  cartItems,
  checkout,
  createSellableVariant,
  createVoucher,
  inventoryStatuses,
  isoFromNow,
  uniqVoucherCode,
  walletBalance,
} from '../helpers/test-data';
import { fundWallet } from '../helpers/wallet';

/** Cart with 2 x 100000 = 200000 subtotal. */
async function cartOf200k(admin: ApiClient, user: ApiClient, stock = 2) {
  const item = await createSellableVariant(admin, { price: '100000', stock });
  await addToCart(user, item.variantId, 2);
  return item;
}

function validate(user: ApiClient, code: string) {
  return user.post('v1/vouchers/validate', { code });
}

async function usedCount(voucherId: string): Promise<number> {
  const [row] = await dbQuery<{ used_count: number }>(
    'SELECT used_count FROM vouchers WHERE id = $1',
    [voucherId],
  );
  return row.used_count;
}

async function redemptions(voucherId: string): Promise<number> {
  const [row] = await dbQuery<{ count: string }>(
    'SELECT COUNT(*) AS count FROM voucher_redemptions WHERE voucher_id = $1',
    [voucherId],
  );
  return Number(row.count);
}

test.describe('E. Voucher rules', () => {
  test('time window and active flag', async ({ admin, userA }) => {
    await cartOf200k(admin.api, userA.api);

    const future = await createVoucher(admin.api, {
      startsAt: isoFromNow(HOUR),
      endsAt: isoFromNow(DAY),
    });
    expect((await validate(userA.api, future.code)).status).toBe(400);

    const expired = await createVoucher(admin.api, {
      startsAt: isoFromNow(-2 * DAY),
      endsAt: isoFromNow(-DAY),
    });
    expect((await validate(userA.api, expired.code)).status).toBe(400);

    const inactive = await createVoucher(admin.api, { isActive: false });
    expect((await validate(userA.api, inactive.code)).status).toBe(404);

    expect((await validate(userA.api, uniqVoucherCode('NOPE'))).status).toBe(
      404,
    );

    // None of them can be used at checkout either.
    for (const voucher of [future, expired, inactive]) {
      const result = await checkout(userA.api, { voucherCode: voucher.code });
      expect.soft([400, 404], voucher.code).toContain(result.status);
      expect(await usedCount(voucher.id)).toBe(0);
    }
    expect(await cartItems(userA.api)).toHaveLength(1);
  });

  test('minimum order amount', async ({ admin, userA }) => {
    await cartOf200k(admin.api, userA.api);

    const above = await createVoucher(admin.api, {
      minimumOrderAmount: '200000.0001',
    });
    expect((await validate(userA.api, above.code)).status).toBe(400);

    const exact = await createVoucher(admin.api, {
      minimumOrderAmount: '200000',
    });
    const result = expectEnvelope(await validate(userA.api, exact.code), 201);
    expect(result.voucher.discountAmount).toBe('20000.0000');
  });

  test('percentage, fixed, capped and over-sized discounts', async ({
    admin,
    userA,
  }) => {
    await cartOf200k(admin.api, userA.api);

    const cases: { overrides: Record<string, unknown>; discount: string; total: string }[] = [
      {
        overrides: { discountType: 'PERCENTAGE', discountValue: '10' },
        discount: '20000.0000',
        total: '180000.0000',
      },
      {
        overrides: { discountType: 'PERCENTAGE', discountValue: '12.5' },
        discount: '25000.0000',
        total: '175000.0000',
      },
      {
        overrides: { discountType: 'FIXED_AMOUNT', discountValue: '15000' },
        discount: '15000.0000',
        total: '185000.0000',
      },
      {
        overrides: {
          discountType: 'PERCENTAGE',
          discountValue: '50',
          maximumDiscountAmount: '30000',
        },
        discount: '30000.0000',
        total: '170000.0000',
      },
      {
        // cap larger than the computed discount has no effect
        overrides: {
          discountType: 'PERCENTAGE',
          discountValue: '10',
          maximumDiscountAmount: '999999',
        },
        discount: '20000.0000',
        total: '180000.0000',
      },
      {
        // fixed discount larger than the subtotal is clamped to the subtotal
        overrides: { discountType: 'FIXED_AMOUNT', discountValue: '500000' },
        discount: '200000.0000',
        total: '0.0000',
      },
      {
        overrides: { discountType: 'PERCENTAGE', discountValue: '100' },
        discount: '200000.0000',
        total: '0.0000',
      },
    ];

    for (const { overrides, discount, total } of cases) {
      const voucher = await createVoucher(admin.api, overrides);
      const data = expectEnvelope(await validate(userA.api, voucher.code), 201);
      expect.soft(data.voucher, JSON.stringify(overrides)).toMatchObject({
        subtotal: '200000.0000',
        discountAmount: discount,
        totalAmount: total,
      });
      // validate is a dry run
      expect(await usedCount(voucher.id)).toBe(0);
    }
  });

  test('voucher definition is validated', async ({ admin, userA }) => {
    const base = {
      name: 'x',
      usageLimit: 1,
      startsAt: isoFromNow(-HOUR),
      endsAt: isoFromNow(DAY),
    };
    const over100 = await admin.api.post('v1/admin/vouchers', {
      ...base,
      code: uniqVoucherCode(),
      discountType: 'PERCENTAGE',
      discountValue: '101',
    });
    expect.soft(over100.status, 'percentage > 100').toBe(400);

    const negative = await admin.api.post('v1/admin/vouchers', {
      ...base,
      code: uniqVoucherCode(),
      discountType: 'FIXED_AMOUNT',
      discountValue: '-5000',
    });
    expect.soft(negative.status, 'negative discount').toBe(400);

    const negativeLimit = await admin.api.post('v1/admin/vouchers', {
      ...base,
      code: uniqVoucherCode(),
      discountType: 'FIXED_AMOUNT',
      discountValue: '5000',
      usageLimit: -1,
    });
    expect.soft(negativeLimit.status, 'negative usage limit').toBe(400);

    const byUser = await userA.api.post('v1/admin/vouchers', {
      ...base,
      code: uniqVoucherCode(),
      discountType: 'PERCENTAGE',
      discountValue: '100',
    });
    expect(byUser.status).toBe(403);
  });

  test('checkout applies the voucher: totals, redemption row, wallet debit', async ({
    admin,
    anon,
    userA,
  }) => {
    const item = await cartOf200k(admin.api, userA.api);
    await fundWallet(anon, userA.api, '200000');
    const voucher = await createVoucher(admin.api, {
      discountType: 'PERCENTAGE',
      discountValue: '50',
      maximumDiscountAmount: '30000',
    });

    // lower-case code is accepted
    const result = await checkout(userA.api, {
      voucherCode: voucher.code.toLowerCase(),
    });
    const order = expectEnvelope(result, 201).order;
    expect(order).toMatchObject({
      voucherId: voucher.id,
      subtotal: '200000.0000',
      discountAmount: '30000.0000',
      totalAmount: '170000.0000',
    });
    expect(await walletBalance(userA.api)).toBe('30000.0000');
    expect(await usedCount(voucher.id)).toBe(1);

    const rows = await dbQuery<{
      account_id: string;
      order_id: string;
      discount_amount: string;
    }>(
      'SELECT account_id, order_id, discount_amount FROM voucher_redemptions WHERE voucher_id = $1',
      [voucher.id],
    );
    expect(rows).toEqual([
      {
        account_id: userA.accountId,
        order_id: order.id,
        discount_amount: '30000.0000',
      },
    ]);
    expect(await inventoryStatuses(admin.api, item.variantId)).toEqual({
      SOLD: 2,
    });
  });

  test('a 100% voucher produces a zero total, never a negative one', async ({
    admin,
    userA,
  }) => {
    await cartOf200k(admin.api, userA.api);
    const voucher = await createVoucher(admin.api, {
      discountType: 'FIXED_AMOUNT',
      discountValue: '999999',
    });
    // No funds needed: the total is exactly zero.
    const order = expectEnvelope(
      await checkout(userA.api, { voucherCode: voucher.code }),
      201,
    ).order;
    expect(order.discountAmount).toBe('200000.0000');
    expect(order.totalAmount).toBe('0.0000');
    expect(await walletBalance(userA.api)).toBe('0.0000');

    const [row] = await dbQuery<{ negative: string }>(
      `SELECT COUNT(*) AS negative FROM orders
       WHERE account_id = $1 AND (total_amount < 0 OR discount_amount > subtotal)`,
      [userA.accountId],
    );
    expect(Number(row.negative)).toBe(0);
  });

  test('global usage limit', async ({ admin, anon, userA, userB }) => {
    const voucher = await createVoucher(admin.api, {
      usageLimit: 1,
      perAccountLimit: 5,
    });
    for (const user of [userA, userB]) {
      await cartOf200k(admin.api, user.api);
      await fundWallet(anon, user.api, '200000');
    }

    expectEnvelope(
      await checkout(userA.api, { voucherCode: voucher.code }),
      201,
    );
    const second = await checkout(userB.api, { voucherCode: voucher.code });
    expect(second.status).toBe(409);
    expect((await validate(userB.api, voucher.code)).status).toBe(409);

    expect(await usedCount(voucher.id)).toBe(1);
    expect(await redemptions(voucher.id)).toBe(1);
    expect(await walletBalance(userB.api)).toBe('200000.0000');
    expect(await cartItems(userB.api)).toHaveLength(1);
  });

  test('per-account usage limit', async ({ admin, anon, userA, userB }) => {
    const voucher = await createVoucher(admin.api, {
      usageLimit: 10,
      perAccountLimit: 1,
    });
    await fundWallet(anon, userA.api, '400000');
    await cartOf200k(admin.api, userA.api);
    expectEnvelope(
      await checkout(userA.api, { voucherCode: voucher.code }),
      201,
    );

    await cartOf200k(admin.api, userA.api);
    const again = await checkout(userA.api, { voucherCode: voucher.code });
    expect(again.status).toBe(409);
    expect(await usedCount(voucher.id)).toBe(1);

    // Another account still can.
    await fundWallet(anon, userB.api, '200000');
    await cartOf200k(admin.api, userB.api);
    expectEnvelope(
      await checkout(userB.api, { voucherCode: voucher.code }),
      201,
    );
    expect(await usedCount(voucher.id)).toBe(2);
    expect(await redemptions(voucher.id)).toBe(2);
  });

  test('two concurrent checkouts for the last voucher use: one wins, the loser is rolled back', async ({
    admin,
    anon,
    userA,
    userB,
  }) => {
    const voucher = await createVoucher(admin.api, {
      usageLimit: 1,
      perAccountLimit: 1,
    });
    const items = [];
    for (const user of [userA, userB]) {
      items.push(await cartOf200k(admin.api, user.api));
      await fundWallet(anon, user.api, '200000');
    }

    const results = await Promise.all([
      checkout(userA.api, { voucherCode: voucher.code }),
      checkout(userB.api, { voucherCode: voucher.code }),
    ]);
    expect(results.map((r) => r.status).sort()).toEqual([201, 409]);
    expect(await usedCount(voucher.id)).toBe(1);
    expect(await redemptions(voucher.id)).toBe(1);

    const sessions = [userA, userB];
    const loserIndex = results.findIndex((r) => r.status === 409);
    const loser = sessions[loserIndex];
    expect(await walletBalance(loser.api)).toBe('200000.0000');
    expect(await cartItems(loser.api)).toHaveLength(1);
    expect(
      await inventoryStatuses(admin.api, items[loserIndex].variantId),
    ).toEqual({ AVAILABLE: 2 });
  });

  test('same account double-submitting with a voucher redeems it once', async ({
    admin,
    anon,
    userA,
  }) => {
    const voucher = await createVoucher(admin.api, {
      usageLimit: 5,
      perAccountLimit: 5,
    });
    await cartOf200k(admin.api, userA.api);
    await fundWallet(anon, userA.api, '400000');

    const results = await Promise.all([
      checkout(userA.api, { voucherCode: voucher.code }),
      checkout(userA.api, { voucherCode: voucher.code }),
    ]);
    expect(results.filter((r) => r.status === 201)).toHaveLength(1);
    expect(await usedCount(voucher.id)).toBe(1);
    expect(await redemptions(voucher.id)).toBe(1);
  });

  test('redemption is atomic: a failed payment does not consume the voucher', async ({
    admin,
    userA,
  }) => {
    const voucher = await createVoucher(admin.api, { usageLimit: 1 });
    const item = await cartOf200k(admin.api, userA.api);

    // No funds: wallet debit fails after the voucher was locked and counted.
    const result = await checkout(userA.api, { voucherCode: voucher.code });
    expect(result.status).toBe(400);
    expect(await usedCount(voucher.id)).toBe(0);
    expect(await redemptions(voucher.id)).toBe(0);
    expect(await inventoryStatuses(admin.api, item.variantId)).toEqual({
      AVAILABLE: 2,
    });
  });

  test('BUG-003: usage cannot be recorded through the public coupons API', async ({
    admin,
    anon,
    userA,
    userB,
  }) => {
    const voucher = await createVoucher(admin.api, {
      usageLimit: 1,
      perAccountLimit: 1,
    });
    // A real order of user A, paid without the voucher.
    await cartOf200k(admin.api, userA.api);
    await fundWallet(anon, userA.api, '200000');
    const order = expectEnvelope(await checkout(userA.api), 201).order;

    const body = {
      voucherId: voucher.id,
      accountId: userA.accountId,
      orderId: order.id,
      discountAmount: '1',
    };
    expect.soft((await anon.post('v1/coupons/usage', body)).status, 'anonymous').toBe(401);
    expect
      .soft((await userB.api.post('v1/coupons/usage', body)).status, 'other user')
      .toBe(403);

    // The voucher must be untouched and still usable by a real customer.
    expect(await usedCount(voucher.id)).toBe(0);
    await cartOf200k(admin.api, userB.api);
    expect((await validate(userB.api, voucher.code)).status).toBe(201);
  });

  test('BUG-003: voucher scope links cannot be wiped anonymously', async ({
    admin,
    anon,
  }) => {
    const voucher = await createVoucher(admin.api);
    const item = await createSellableVariant(admin.api, { stock: 0 });
    const linked = await admin.api.patch(`v1/coupons/${voucher.id}/products`, {
      productIds: [item.productId],
    });
    expect([200, 204]).toContain(linked.status);

    const wipe = await anon.patch(`v1/coupons/${voucher.id}/products`, {
      productIds: [],
    });
    expect.soft(wipe.status).toBe(401);

    const [row] = await dbQuery<{ count: string }>(
      'SELECT COUNT(*) AS count FROM coupon_products WHERE voucher_id = $1',
      [voucher.id],
    );
    expect(Number(row.count)).toBe(1);
  });

  test('BUG-008: coupons/validate honours redemptions made at checkout', async ({
    admin,
    anon,
    userA,
  }) => {
    const voucher = await createVoucher(admin.api, {
      usageLimit: 10,
      perAccountLimit: 1,
    });
    await cartOf200k(admin.api, userA.api);
    await fundWallet(anon, userA.api, '200000');
    expectEnvelope(
      await checkout(userA.api, { voucherCode: voucher.code }),
      201,
    );

    // The commerce module knows the account limit is reached...
    await cartOf200k(admin.api, userA.api);
    expect((await validate(userA.api, voucher.code)).status).toBe(409);

    // ...the coupons module must agree.
    const result = await userA.api.post('v1/coupons/validate', {
      code: voucher.code,
      accountId: userA.accountId,
      roleCode: 'USER',
      orderTotal: '200000',
    });
    const data = unwrap(result.body);
    const rejected = result.status >= 400 || data?.valid === false;
    expect(rejected, 'coupon reported as still valid for this account').toBe(
      true,
    );
  });

  test('coupons/validate does not let a caller probe another account', async ({
    admin,
    userA,
    userB,
  }) => {
    const voucher = await createVoucher(admin.api);
    const result = await userA.api.post('v1/coupons/validate', {
      code: voucher.code,
      accountId: userB.accountId,
      roleCode: 'ADMIN',
      orderTotal: '200000',
    });
    // accountId / roleCode must come from the token, not the body.
    expect([400, 403]).toContain(result.status);
  });
});
