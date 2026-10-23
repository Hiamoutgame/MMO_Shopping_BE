import { test, expect } from '../fixtures/auth.fixture';
import { expectEnvelope, expectErrorEnvelope } from '../helpers/api-client';
import { newPassword } from '../helpers/auth';
import {
  DAY,
  HOUR,
  idempotencyKey,
  isoFromNow,
  randomId,
  uniq,
  uniqEmail,
  uniqVoucherCode,
} from '../helpers/test-data';

/**
 * I. API contract and validation.
 * Documented envelope: { success, data, message, errorCode }.
 */
test.describe('I. API contract - success envelope', () => {
  test('public and authenticated endpoints wrap data in the envelope', async ({
    anon,
    userA,
  }) => {
    expectEnvelope(await anon.get('v1/products'), 200);
    expectEnvelope(await anon.get('v1/categories'), 200);
    expectEnvelope(await userA.api.get('v1/cart'), 200);
    expectEnvelope(await userA.api.get('v1/wallet'), 200);
    const orders = expectEnvelope(await userA.api.get('v1/orders'), 200);
    expect(orders).toMatchObject({
      items: expect.any(Array),
      total: expect.any(Number),
      page: 1,
      pageSize: 20,
    });
  });

  test('BUG-019: newer modules use the same envelope', async ({ anon }) => {
    for (const path of ['v1/seasons', 'v1/campaigns', 'v1/packages']) {
      const result = await anon.get(path);
      expect.soft(result.status, path).toBe(200);
      expect
        .soft(
          result.body && typeof result.body === 'object' && 'success' in result.body,
          `${path} is wrapped in the envelope`,
        )
        .toBe(true);
    }
  });
});

test.describe('I. API contract - error envelope (BUG-010)', () => {
  test('401 carries success=false and errorCode=UNAUTHORIZED', async ({
    anon,
  }) => {
    expectErrorEnvelope(await anon.get('v1/auth/me'), 401, 'UNAUTHORIZED');
  });

  test('403 carries errorCode=FORBIDDEN', async ({ userA }) => {
    expectErrorEnvelope(
      await userA.api.get('v1/admin/accounts'),
      403,
      'FORBIDDEN',
    );
  });

  test('404 carries errorCode=NOT_FOUND', async ({ userA }) => {
    expectErrorEnvelope(
      await userA.api.get(`v1/orders/${randomId()}`),
      404,
      'NOT_FOUND',
    );
  });

  test('409 carries the domain error code', async ({ anon, userA }) => {
    const result = await anon.post('v1/auth/register', {
      email: userA.email,
      password: newPassword(),
    });
    expectErrorEnvelope(result, 409, 'EMAIL_ALREADY_EXISTS');
  });

  test('validation errors use the envelope', async ({ anon }) => {
    const result = await anon.post('v1/auth/login', { email: 'nope' });
    expectErrorEnvelope(result, 400, 'BAD_REQUEST');
  });

  test('domain errors keep their specific code', async ({ userA }) => {
    const result = await userA.api.post('v1/checkout', {});
    expectErrorEnvelope(result, 400, 'IDEMPOTENCY_KEY_REQUIRED');
  });

  test('unknown routes use the envelope', async ({ anon }) => {
    expectErrorEnvelope(await anon.get('v1/does-not-exist'), 404, 'NOT_FOUND');
  });
});

test.describe('I. Validation', () => {
  test('BUG-018: malformed UUID path params return a clean 400 without database details', async ({
    admin,
    userA,
    anon,
  }) => {
    const calls = [
      await userA.api.get('v1/orders/not-a-uuid'),
      await userA.api.delete('v1/cart/items/not-a-uuid'),
      await admin.api.get('v1/admin/orders/not-a-uuid'),
      await admin.api.get('v1/admin/accounts/not-a-uuid'),
      await admin.api.get('v1/admin/inventory-items/not-a-uuid'),
      await anon.get('v1/products/not-a-uuid'),
      await anon.get('v1/seasons/not-a-uuid'),
      await anon.get('v1/campaigns/not-a-uuid'),
    ];
    for (const [index, result] of calls.entries()) {
      expect.soft([400, 404], `call #${index}`).toContain(result.status);
      const serialized = JSON.stringify(result.body ?? null);
      expect
        .soft(/invalid input syntax|QueryFailedError|Database Query Failed/i.test(serialized), `call #${index} leaks DB error`)
        .toBe(false);
    }
  });

  test('enum values are validated', async ({ admin }) => {
    const status = await admin.api.patch(
      `v1/admin/orders/${randomId()}/status`,
      { status: 'SHIPPED' },
    );
    expect(status.status).toBe(400);

    const product = await admin.api.post('v1/admin/products', {
      name: uniq('p'),
      status: 'PUBLISHED',
    });
    expect(product.status).toBe(400);

    const voucher = await admin.api.post('v1/admin/vouchers', {
      code: uniqVoucherCode(),
      name: 'x',
      discountType: 'BOGUS',
      discountValue: '10',
      usageLimit: 1,
      startsAt: isoFromNow(-HOUR),
      endsAt: isoFromNow(DAY),
    });
    expect(voucher.status).toBe(400);

    const inventoryFilter = await admin.api.get('v1/admin/inventory-items', {
      params: { status: 'BOGUS' },
    });
    expect(inventoryFilter.status).toBe(400);
  });

  test('quantities are validated', async ({ userA }) => {
    for (const quantity of [0, -1, 1.5, 'abc', null]) {
      const result = await userA.api.post('v1/cart/items', {
        productVariantId: randomId(),
        quantity,
      });
      expect.soft(result.status, `quantity=${String(quantity)}`).toBe(400);
    }
    const missing = await userA.api.post('v1/cart/items', {
      productVariantId: randomId(),
    });
    expect(missing.status).toBe(400);
    const badVariant = await userA.api.post('v1/cart/items', {
      productVariantId: 'not-a-uuid',
      quantity: 1,
    });
    expect(badVariant.status).toBe(400);
  });

  test('amounts are validated', async ({ userA }) => {
    for (const amount of ['abc', '-5', '0', '', null, 1000]) {
      const result = await userA.api.post(
        'v1/deposits',
        { amount },
        { headers: { 'Idempotency-Key': idempotencyKey('amount') } },
      );
      expect.soft(result.status, `amount=${String(amount)}`).toBe(400);
    }
  });

  test('dates are validated', async ({ admin }) => {
    const base = {
      code: uniqVoucherCode(),
      name: 'x',
      discountType: 'PERCENTAGE',
      discountValue: '10',
      usageLimit: 1,
    };
    const invalid = await admin.api.post('v1/admin/vouchers', {
      ...base,
      startsAt: 'yesterday',
      endsAt: 'tomorrow',
    });
    expect(invalid.status).toBe(400);

    const inverted = await admin.api.post('v1/admin/vouchers', {
      ...base,
      startsAt: isoFromNow(DAY),
      endsAt: isoFromNow(-DAY),
    });
    expect(inverted.status).toBe(400);
  });

  test('pagination is validated', async ({ userA }) => {
    expect(
      (await userA.api.get('v1/orders', { params: { page: 0 } })).status,
    ).toBe(400);
    expect(
      (await userA.api.get('v1/orders', { params: { pageSize: 1000 } })).status,
    ).toBe(400);
    expect(
      (await userA.api.get('v1/orders', { params: { page: 'x' } })).status,
    ).toBe(400);
  });

  test('unknown fields are rejected by the ValidationPipe', async ({
    admin,
    anon,
    userA,
  }) => {
    const login = await anon.post('v1/auth/login', {
      email: uniqEmail('x'),
      password: newPassword(),
      isAdmin: true,
    });
    expect(login.status).toBe(400);

    const cart = await userA.api.post('v1/cart/items', {
      productVariantId: randomId(),
      quantity: 1,
      price: '1',
    });
    expect(cart.status).toBe(400);

    const product = await admin.api.post('v1/admin/products', {
      name: uniq('p'),
      basePrice: '1',
      id: randomId(),
    });
    expect(product.status).toBe(400);
  });

  test('BUG-005: newer modules also reject unknown fields and wrong types', async ({
    admin,
  }) => {
    const pricing = await admin.api.post('v1/pricing/calculate', {
      productId: 'not-a-uuid',
      accountId: 'not-a-uuid',
      quantity: 'many',
      hacked: true,
    });
    expect.soft(pricing.status, 'pricing/calculate').toBe(400);

    const coupon = await admin.api.post('v1/coupons/validate', {
      code: 12345,
      orderTotal: { amount: 1 },
      hacked: true,
    });
    expect.soft(coupon.status, 'coupons/validate').toBe(400);

    const campaign = await admin.api.post('v1/campaigns', {
      productId: 'not-a-uuid',
      targetQuantity: 'ten',
    });
    expect.soft(campaign.status, 'campaigns').toBe(400);

    const click = await admin.api.post('v1/sellers/referral-clicks', {
      code: { $ne: null },
      sessionId: 1,
    });
    expect.soft(click.status, 'sellers/referral-clicks').toBe(400);
  });
});
