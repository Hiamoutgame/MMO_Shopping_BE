import { test, expect } from '../fixtures/auth.fixture';
import { expectEnvelope, unwrap, type ApiClient } from '../helpers/api-client';
import type { Session } from '../helpers/auth';
import {
  deletePricingFixtures,
  insertPriceRule,
  insertPriceTier,
  setProductPricing,
} from '../helpers/db';
import {
  DAY,
  addToCart,
  checkout,
  createInventory,
  createProduct,
  createVariant,
  createVoucher,
  isoFromNow,
  randomId,
  uniq,
} from '../helpers/test-data';
import { fundWallet } from '../helpers/wallet';

/**
 * F. Pricing engine. Architecture pipeline:
 * Base -> Role -> Quantity tier -> Seasonal -> Package -> Seller referral
 * -> Coupon -> Price floor (sequential, never additive).
 *
 * Price tiers and rules have no admin API, so they are inserted straight into
 * the test database and removed afterwards.
 */
const fixtures = { tierIds: [] as string[], ruleIds: [] as string[] };
const packageIds: string[] = [];
const seasonIds: string[] = [];
const sellerProfileIds: string[] = [];

async function pricedProduct(
  admin: ApiClient,
  basePrice: string | null = '100000',
  floor: string | null = null,
) {
  const product = await createProduct(admin);
  await setProductPricing(product.id, basePrice, floor);
  return product;
}

async function tier(input: Parameters<typeof insertPriceTier>[0]) {
  fixtures.tierIds.push(await insertPriceTier(input));
}

async function rule(input: Parameters<typeof insertPriceRule>[0]) {
  fixtures.ruleIds.push(await insertPriceRule(input));
}

function calculate(
  session: Session,
  body: Record<string, unknown>,
  client: ApiClient = session.api,
) {
  return client.post('v1/pricing/calculate', {
    accountId: session.accountId,
    quantity: 1,
    ...body,
  });
}

async function finalPrice(session: Session, body: Record<string, unknown>) {
  const result = await calculate(session, body);
  expect([200, 201]).toContain(result.status);
  return unwrap(result.body);
}

async function createSeason(admin: ApiClient) {
  const result = await admin.post('v1/seasons', {
    name: uniq('season'),
    slug: uniq('season').replace(/_/g, '-'),
    startDate: isoFromNow(-DAY),
    endDate: isoFromNow(DAY),
  });
  expect(result.status).toBe(201);
  const season = unwrap(result.body);
  seasonIds.push(season.id);
  return season as { id: string };
}

async function createPackage(
  admin: ApiClient,
  productId: string,
  overrides: Record<string, unknown> = {},
) {
  const result = await admin.post('v1/packages', {
    name: uniq('package'),
    slug: uniq('package').replace(/_/g, '-'),
    quantity: 10,
    displayPrice: '700000',
    unitPrice: '70000',
    applicableRoles: ['SELLER'],
    products: [{ productId, quantity: 10 }],
    ...overrides,
  });
  expect(result.status).toBe(201);
  const pkg = unwrap(result.body);
  packageIds.push(pkg.id);
  return pkg as { id: string };
}

async function createReferralCode(admin: Session, seller: Session) {
  const profile = unwrap(
    (
      await admin.api.post('v1/sellers/profiles', {
        accountId: seller.accountId,
      })
    ).body,
  );
  sellerProfileIds.push(profile.id);
  const approved = await admin.api.post(
    `v1/sellers/profiles/${profile.id}/approve`,
    { approvedBy: admin.accountId },
  );
  expect([200, 201]).toContain(approved.status);
  const code = unwrap(
    (await admin.api.post(`v1/sellers/profiles/${profile.id}/referral-codes`))
      .body,
  );
  return code as { id: string; code: string };
}

test.afterEach(async ({ admin }) => {
  await deletePricingFixtures({
    tierIds: fixtures.tierIds.splice(0),
    ruleIds: fixtures.ruleIds.splice(0),
  });
  for (const id of packageIds.splice(0)) {
    await admin.api.delete(`v1/packages/${id}`);
  }
  for (const id of sellerProfileIds.splice(0)) {
    await admin.api.delete(`v1/sellers/profiles/${id}`);
  }
  for (const id of seasonIds.splice(0)) {
    await admin.api.delete(`v1/seasons/${id}`);
  }
});

test.describe('F. Price engine - pipeline', () => {
  test('base price only', async ({ admin, userA }) => {
    const product = await pricedProduct(admin.api);
    const price = await finalPrice(userA, { productId: product.id });
    expect(price).toMatchObject({
      basePrice: '100000.0000',
      finalPrice: '100000.0000',
      totalDiscount: '0.0000',
      floorEnforced: false,
    });
    expect(price.breakdown[0]).toMatchObject({
      type: 'base',
      amount: '100000.0000',
    });
  });

  test('role pricing for USER / SELLER / ADMIN', async ({
    admin,
    seller,
    userA,
  }) => {
    const product = await pricedProduct(admin.api);
    await tier({ productId: product.id, roleCode: 'USER', quantityFrom: 1, unitPrice: '95000' });
    await tier({ productId: product.id, roleCode: 'SELLER', quantityFrom: 1, unitPrice: '80000' });

    expect((await finalPrice(userA, { productId: product.id })).finalPrice).toBe('95000.0000');
    expect((await finalPrice(seller, { productId: product.id })).finalPrice).toBe('80000.0000');
    // No ADMIN tier: admin pays the base price.
    expect((await finalPrice(admin, { productId: product.id })).finalPrice).toBe('100000.0000');
  });

  test('quantity tier boundaries', async ({ admin, userA }) => {
    const product = await pricedProduct(admin.api);
    await tier({ productId: product.id, roleCode: 'USER', quantityFrom: 1, quantityTo: 9, unitPrice: '95000' });
    await tier({ productId: product.id, roleCode: 'USER', quantityFrom: 10, quantityTo: 19, unitPrice: '90000' });
    await tier({ productId: product.id, roleCode: 'USER', quantityFrom: 20, quantityTo: null, unitPrice: '85000' });

    const expectations: [number, string][] = [
      [1, '95000.0000'],
      [9, '95000.0000'],
      [10, '90000.0000'],
      [11, '90000.0000'],
      [19, '90000.0000'],
      [20, '85000.0000'],
      [21, '85000.0000'],
      [5000, '85000.0000'],
    ];
    for (const [quantity, expected] of expectations) {
      const price = await finalPrice(userA, { productId: product.id, quantity });
      expect.soft(price.finalPrice, `quantity=${quantity}`).toBe(expected);
    }
  });

  test('inactive tiers and tiers of another product are ignored', async ({
    admin,
    userA,
  }) => {
    const product = await pricedProduct(admin.api);
    const other = await pricedProduct(admin.api);
    await tier({ productId: product.id, roleCode: 'USER', quantityFrom: 1, unitPrice: '1000', isActive: false });
    await tier({ productId: other.id, roleCode: 'USER', quantityFrom: 1, unitPrice: '2000' });
    expect((await finalPrice(userA, { productId: product.id })).finalPrice).toBe('100000.0000');
  });

  test('discounts are applied sequentially, not added together', async ({
    admin,
  }) => {
    const product = await pricedProduct(admin.api);
    const season = await createSeason(admin.api);
    await rule({
      name: uniq('seasonal'),
      ruleType: 'SEASONAL',
      discountType: 'PERCENTAGE',
      discountValue: '10',
      applicableProductIds: [product.id],
      applicableSeasonIds: [season.id],
    });
    const voucher = await createVoucher(admin.api, {
      discountType: 'PERCENTAGE',
      discountValue: '10',
    });

    const price = await finalPrice(admin, {
      productId: product.id,
      seasonId: season.id,
      couponCode: voucher.code,
    });
    // 100000 -> -10% = 90000 -> -10% = 81000 (additive would be 80000)
    expect(price.finalPrice).toBe('81000.0000');
    expect(price.totalDiscount).toBe('19000.0000');
    expect(price.discountPercentage).toBe('19.00');
    expect(price.breakdown.map((step: any) => step.amount)).toEqual([
      '100000.0000',
      '90000.0000',
      '81000.0000',
    ]);
  });

  test('seasonal rules outside their validity window are ignored', async ({
    admin,
  }) => {
    const product = await pricedProduct(admin.api);
    const season = await createSeason(admin.api);
    const common = {
      ruleType: 'SEASONAL',
      discountType: 'PERCENTAGE' as const,
      discountValue: '10',
      applicableProductIds: [product.id],
      applicableSeasonIds: [season.id],
    };
    await rule({ ...common, name: uniq('expired'), startDate: isoFromNow(-3 * DAY), endDate: isoFromNow(-DAY) });
    await rule({ ...common, name: uniq('future'), startDate: isoFromNow(DAY), endDate: isoFromNow(2 * DAY) });
    await rule({ ...common, name: uniq('inactive'), isActive: false });

    const price = await finalPrice(admin, {
      productId: product.id,
      seasonId: season.id,
    });
    expect(price.finalPrice).toBe('100000.0000');

    // And a valid rule is not applied without the season being requested.
    await rule({ ...common, name: uniq('valid') });
    expect((await finalPrice(admin, { productId: product.id })).finalPrice).toBe('100000.0000');
    expect(
      (await finalPrice(admin, { productId: product.id, seasonId: season.id })).finalPrice,
    ).toBe('90000.0000');
  });

  test('package price applies only to allowed roles', async ({
    admin,
    seller,
    userA,
  }) => {
    const product = await pricedProduct(admin.api);
    const pkg = await createPackage(admin.api, product.id);

    expect(
      (await finalPrice(seller, { productId: product.id, packageId: pkg.id })).finalPrice,
    ).toBe('70000.0000');
    expect(
      (await finalPrice(userA, { productId: product.id, packageId: pkg.id })).finalPrice,
    ).toBe('100000.0000');
    expect(
      (await finalPrice(seller, { productId: product.id, packageId: randomId() })).finalPrice,
    ).toBe('100000.0000');
  });

  test('BUG-009: deactivated or expired packages are not applied', async ({
    admin,
    seller,
  }) => {
    const product = await pricedProduct(admin.api);
    const inactive = await createPackage(admin.api, product.id);
    const deactivated = await admin.api.post(`v1/packages/${inactive.id}/deactivate`);
    expect([200, 201]).toContain(deactivated.status);
    const expired = await createPackage(admin.api, product.id, {
      startDate: isoFromNow(-3 * DAY),
      endDate: isoFromNow(-DAY),
    });

    expect
      .soft(
        (await finalPrice(seller, { productId: product.id, packageId: inactive.id })).finalPrice,
        'inactive package',
      )
      .toBe('100000.0000');
    expect
      .soft(
        (await finalPrice(seller, { productId: product.id, packageId: expired.id })).finalPrice,
        'expired package',
      )
      .toBe('100000.0000');
  });

  test('BUG-009: a package that does not contain the product is not applied', async ({
    admin,
    seller,
  }) => {
    const product = await pricedProduct(admin.api);
    const other = await pricedProduct(admin.api);
    const pkg = await createPackage(admin.api, other.id);
    expect(
      (await finalPrice(seller, { productId: product.id, packageId: pkg.id })).finalPrice,
    ).toBe('100000.0000');
  });

  test('unknown or inactive seller codes give no discount', async ({
    admin,
    seller,
    userA,
  }) => {
    const product = await pricedProduct(admin.api);
    const code = await createReferralCode(admin, seller);
    await rule({
      name: uniq('seller-rule'),
      ruleType: 'ROLE_BASED',
      discountType: 'PERCENTAGE',
      discountValue: '5',
      applicableRoles: ['SELLER'],
      applicableProductIds: [product.id],
    });

    expect(
      (await finalPrice(userA, { productId: product.id, sellerCode: 'E2E-NOPE' })).finalPrice,
    ).toBe('100000.0000');
    // Active code applies the rule (exact scoping is asserted in the BUG-009 test).
    expect(
      Number(
        (await finalPrice(userA, { productId: product.id, sellerCode: code.code })).finalPrice,
      ),
    ).toBeLessThanOrEqual(95000);

    const off = await admin.api.post(`v1/sellers/referral-codes/${code.id}/deactivate`);
    expect([200, 201]).toContain(off.status);
    expect(
      (await finalPrice(userA, { productId: product.id, sellerCode: code.code })).finalPrice,
    ).toBe('100000.0000');
  });

  test('BUG-009: seller referral rules scoped to another product or expired are not applied', async ({
    admin,
    seller,
    userA,
  }) => {
    const product = await pricedProduct(admin.api);
    const other = await pricedProduct(admin.api);
    const code = await createReferralCode(admin, seller);
    const common = {
      ruleType: 'ROLE_BASED',
      discountType: 'PERCENTAGE' as const,
      discountValue: '5',
      applicableRoles: ['SELLER'],
    };
    await rule({ ...common, name: uniq('other-product'), applicableProductIds: [other.id] });
    await rule({
      ...common,
      name: uniq('expired'),
      applicableProductIds: [product.id],
      startDate: isoFromNow(-3 * DAY),
      endDate: isoFromNow(-DAY),
    });

    const price = await finalPrice(userA, {
      productId: product.id,
      sellerCode: code.code,
    });
    expect(price.finalPrice).toBe('100000.0000');
  });

  test('expired and inactive coupons are ignored', async ({ admin, userA }) => {
    const product = await pricedProduct(admin.api);
    const expired = await createVoucher(admin.api, {
      startsAt: isoFromNow(-2 * DAY),
      endsAt: isoFromNow(-DAY),
    });
    const inactive = await createVoucher(admin.api, { isActive: false });
    const future = await createVoucher(admin.api, {
      startsAt: isoFromNow(DAY),
      endsAt: isoFromNow(2 * DAY),
    });
    for (const voucher of [expired, inactive, future]) {
      const price = await finalPrice(userA, {
        productId: product.id,
        couponCode: voucher.code,
      });
      expect.soft(price.finalPrice, voucher.code).toBe('100000.0000');
    }
  });

  test('BUG-008: a coupon with no remaining uses is ignored', async ({
    admin,
    userA,
  }) => {
    const product = await pricedProduct(admin.api);
    // usageLimit 0: checkout treats it as exhausted.
    const exhausted = await createVoucher(admin.api, { usageLimit: 0 });
    const price = await finalPrice(userA, {
      productId: product.id,
      couponCode: exhausted.code,
    });
    expect(price.finalPrice).toBe('100000.0000');
  });

  test('coupon maximum discount cap', async ({ admin, userA }) => {
    const product = await pricedProduct(admin.api);
    const voucher = await createVoucher(admin.api, {
      discountType: 'PERCENTAGE',
      discountValue: '50',
      maximumDiscountAmount: '20000',
    });
    const price = await finalPrice(userA, {
      productId: product.id,
      couponCode: voucher.code,
    });
    expect(price.finalPrice).toBe('80000.0000');
  });

  test('price floor is enforced', async ({ admin, userA }) => {
    const product = await pricedProduct(admin.api, '100000', '90000');
    const voucher = await createVoucher(admin.api, {
      discountType: 'PERCENTAGE',
      discountValue: '50',
    });
    const price = await finalPrice(userA, {
      productId: product.id,
      couponCode: voucher.code,
    });
    expect(price).toMatchObject({
      finalPrice: '90000.0000',
      priceFloor: '90000.0000',
      floorEnforced: true,
      totalDiscount: '10000.0000',
    });

    // Floor not reached: untouched.
    const small = await createVoucher(admin.api, {
      discountType: 'PERCENTAGE',
      discountValue: '5',
    });
    const above = await finalPrice(userA, {
      productId: product.id,
      couponCode: small.code,
    });
    expect(above).toMatchObject({
      finalPrice: '95000.0000',
      floorEnforced: false,
    });
  });

  test('BUG-009: a fixed discount larger than the price never yields a negative price', async ({
    admin,
    userA,
  }) => {
    const product = await pricedProduct(admin.api);
    const voucher = await createVoucher(admin.api, {
      discountType: 'FIXED_AMOUNT',
      discountValue: '150000',
    });
    const price = await finalPrice(userA, {
      productId: product.id,
      couponCode: voucher.code,
    });
    expect(Number(price.finalPrice)).toBeGreaterThanOrEqual(0);
    for (const step of price.breakdown) {
      expect.soft(Number(step.amount), step.step).toBeGreaterThanOrEqual(0);
    }
    expect(Number(price.totalDiscount)).toBeLessThanOrEqual(100000);
  });

  test('BUG-009: a product without a base price does not produce NaN/Infinity', async ({
    admin,
    userA,
  }) => {
    const product = await pricedProduct(admin.api, null);
    const result = await calculate(userA, { productId: product.id });
    const serialized = JSON.stringify(result.body);
    expect.soft(serialized).not.toMatch(/NaN|Infinity/);
    expect(result.status).toBeLessThan(500);
  });
});

test.describe('F. Price engine - input validation and access control', () => {
  test('BUG-009: unknown product or account returns 404, not 500', async ({
    admin,
    userA,
  }) => {
    const product = await pricedProduct(admin.api);
    const noProduct = await calculate(userA, { productId: randomId() });
    expect.soft(noProduct.status, 'unknown product').toBe(404);

    const noAccount = await userA.api.post('v1/pricing/calculate', {
      productId: product.id,
      accountId: randomId(),
      quantity: 1,
    });
    expect.soft([400, 403, 404], 'unknown account').toContain(noAccount.status);
  });

  test('BUG-009: quantity must be a positive integer', async ({
    admin,
    userA,
  }) => {
    const product = await pricedProduct(admin.api);
    for (const quantity of [0, -1, 1.5, 'abc', null]) {
      const result = await calculate(userA, { productId: product.id, quantity });
      expect.soft(result.status, `quantity=${String(quantity)}`).toBe(400);
    }
  });

  test('BUG-002: anonymous callers cannot use the price engine', async ({
    admin,
    anon,
    userA,
  }) => {
    const product = await pricedProduct(admin.api);
    const result = await calculate(userA, { productId: product.id }, anon);
    expect(result.status).toBe(401);
  });

  test('BUG-009: a USER cannot obtain SELLER pricing by sending another accountId', async ({
    admin,
    seller,
    userA,
  }) => {
    const product = await pricedProduct(admin.api);
    await tier({ productId: product.id, roleCode: 'USER', quantityFrom: 1, unitPrice: '95000' });
    await tier({ productId: product.id, roleCode: 'SELLER', quantityFrom: 1, unitPrice: '60000' });

    // userA's token, seller's accountId in the body.
    const result = await calculate(seller, { productId: product.id }, userA.api);
    if (result.status < 400) {
      expect(unwrap(result.body).finalPrice).toBe('95000.0000');
    } else {
      expect([400, 403]).toContain(result.status);
    }
  });
});

test.describe('F. Price engine - checkout integration', () => {
  test('BUG-007: checkout charges the price computed by the price engine', async ({
    admin,
    anon,
    userA,
  }) => {
    // Variant list price 100000, USER role price 95000.
    const product = await pricedProduct(admin.api);
    const variant = await createVariant(admin.api, product.id, { price: '100000' });
    await createInventory(admin.api, variant.id, 1);
    await tier({ productId: product.id, roleCode: 'USER', quantityFrom: 1, unitPrice: '95000' });

    const quoted = await finalPrice(userA, { productId: product.id });
    expect(quoted.finalPrice).toBe('95000.0000');

    await fundWallet(anon, userA.api, '100000');
    await addToCart(userA.api, variant.id, 1);
    const order = expectEnvelope(await checkout(userA.api), 201).order;

    expect(order.items[0].unitPrice).toBe(quoted.finalPrice);
    expect(order.totalAmount).toBe('95000.0000');
  });
});
