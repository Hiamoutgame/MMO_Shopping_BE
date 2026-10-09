import { test, expect } from '../fixtures/auth.fixture';
import { randomId } from '../helpers/test-data';

/**
 * B. Authorization / RBAC matrix.
 *
 * Endpoint inventory (read directly from the controllers):
 *
 * | Module    | Controller prefix          | Declared guards                      |
 * |-----------|----------------------------|--------------------------------------|
 * | identity  | v1/auth                    | JwtAuthGuard on logout/logout-all/me |
 * | identity  | v1/admin/accounts, roles   | JwtAuthGuard + RolesGuard(ADMIN)     |
 * | catalog   | v1 (public), v1/admin      | public / JwtAuthGuard + ADMIN        |
 * | inventory | v1/admin/inventory-items   | JwtAuthGuard + ADMIN                 |
 * | shopping  | v1/cart, v1/favorites      | JwtAuthGuard                         |
 * | commerce  | v1/checkout, v1/orders     | JwtAuthGuard                         |
 * | commerce  | v1/admin/orders, vouchers  | JwtAuthGuard + ADMIN                 |
 * | finance   | v1/wallet, v1/deposits     | JwtAuthGuard                         |
 * | finance   | v1/admin/payment-*, ledger | JwtAuthGuard + ADMIN                 |
 * | cashback  | v1/cashback/*              | JwtAuthGuard (config is public)      |
 * | system    | v1/admin/dashboard, ...    | JwtAuthGuard + ADMIN                 |
 * | seasons   | v1/seasons                 | RolesGuard only on mutations         |
 * | chung-suc | v1/campaigns               | public reads; JWT join; ADMIN writes |
 * | pricing   | v1/pricing/calculate       | NONE                                 |
 * | packages  | v1/packages                | NONE                                 |
 * | sellers   | v1/sellers                 | NONE                                 |
 * | coupons   | v1/coupons                 | NONE                                 |
 * | purchase  | v1/purchase                | NONE                                 |
 * | analytics | v1/analytics               | NONE                                 |
 */

const USER_ENDPOINTS: string[] = [
  'v1/auth/me',
  'v1/cart',
  'v1/favorites',
  'v1/orders',
  'v1/wallet',
  'v1/wallet-transactions',
  'v1/cashback/connection',
];

const ADMIN_ENDPOINTS: string[] = [
  'v1/admin/accounts',
  'v1/admin/roles',
  'v1/admin/categories',
  'v1/admin/products',
  'v1/admin/inventory-items',
  'v1/admin/orders',
  'v1/admin/vouchers',
  'v1/admin/payment-transactions',
  'v1/admin/wallet-ledgers',
  'v1/admin/dashboard/overview',
  'v1/admin/audit-logs',
];

/** Internal/back-office data exposed by the newer modules. */
const INTERNAL_READ_ENDPOINTS: string[] = [
  'v1/sellers/profiles',
  'v1/analytics/profit-records',
  'v1/analytics/profit-summary',
  'v1/analytics/test-campaigns',
  'v1/purchase/batches',
  'v1/purchase/cost-tiers',
  `v1/coupons/usage?voucherId=${randomId()}`,
  `v1/coupons/${randomId()}/stats`,
];

/**
 * Back-office mutations. Bodies reference random UUIDs so that even when the
 * endpoint is reachable nothing can be created or modified.
 */
const INTERNAL_MUTATIONS: { method: 'POST' | 'PATCH' | 'DELETE'; path: string; body?: unknown }[] =
  [
    { method: 'POST', path: 'v1/campaigns', body: { productId: randomId() } },
    { method: 'PATCH', path: `v1/campaigns/${randomId()}`, body: {} },
    { method: 'DELETE', path: `v1/campaigns/${randomId()}` },
    { method: 'POST', path: `v1/campaigns/${randomId()}/activate` },
    {
      method: 'POST',
      path: 'v1/packages',
      body: {
        name: 'x',
        slug: `e2e-${randomId()}`,
        quantity: 1,
        displayPrice: '1',
        unitPrice: '1',
        applicableRoles: ['USER'],
        products: [{ productId: randomId(), quantity: 1 }],
      },
    },
    { method: 'DELETE', path: `v1/packages/${randomId()}` },
    { method: 'POST', path: 'v1/sellers/profiles', body: { accountId: randomId() } },
    {
      method: 'POST',
      path: `v1/sellers/profiles/${randomId()}/approve`,
      body: { approvedBy: randomId() },
    },
    { method: 'DELETE', path: `v1/sellers/profiles/${randomId()}` },
    {
      method: 'POST',
      path: 'v1/purchase/batches',
      body: { productId: randomId(), batchNumber: 'x', quantity: 1, costPerUnit: '1' },
    },
    { method: 'DELETE', path: `v1/purchase/batches/${randomId()}` },
    {
      method: 'POST',
      path: 'v1/analytics/test-campaigns',
      body: { productId: randomId(), name: 'x', testBudget: '1', testQuantity: 1, costPerUnit: '1' },
    },
    { method: 'DELETE', path: `v1/analytics/test-campaigns/${randomId()}` },
    {
      method: 'POST',
      path: 'v1/coupons/usage',
      body: { voucherId: randomId(), accountId: randomId(), orderId: randomId(), discountAmount: '1' },
    },
    { method: 'PATCH', path: `v1/coupons/${randomId()}/products`, body: { productIds: [] } },
  ];

test.describe('B. RBAC - established modules', () => {
  test('anonymous is rejected with 401 on authenticated user APIs', async ({
    anon,
  }) => {
    for (const path of USER_ENDPOINTS) {
      expect.soft((await anon.get(path)).status, `GET ${path}`).toBe(401);
    }
    const mutations: [string, unknown][] = [
      ['v1/cart/items', { productVariantId: randomId(), quantity: 1 }],
      ['v1/checkout', {}],
      ['v1/deposits', { amount: '1000' }],
      ['v1/favorites', { productId: randomId() }],
      ['v1/vouchers/validate', { code: 'X' }],
      ['v1/auth/logout', {}],
      ['v1/auth/logout-all', {}],
    ];
    for (const [path, body] of mutations) {
      expect.soft((await anon.post(path, body)).status, `POST ${path}`).toBe(401);
    }
  });

  test('anonymous is rejected with 401 on admin APIs', async ({ anon }) => {
    for (const path of ADMIN_ENDPOINTS) {
      expect.soft((await anon.get(path)).status, `GET ${path}`).toBe(401);
    }
  });

  test('USER is rejected with 403 on admin APIs', async ({ userA }) => {
    for (const path of ADMIN_ENDPOINTS) {
      expect.soft((await userA.api.get(path)).status, `GET ${path}`).toBe(403);
    }
    const create = await userA.api.post('v1/admin/products', { name: 'x' });
    expect(create.status).toBe(403);
    const refund = await userA.api.post(
      `v1/admin/orders/${randomId()}/refund`,
      {},
      { headers: { 'Idempotency-Key': randomId() } },
    );
    expect(refund.status).toBe(403);
  });

  test('SELLER is rejected with 403 on admin APIs', async ({ seller }) => {
    for (const path of ADMIN_ENDPOINTS) {
      expect.soft((await seller.api.get(path)).status, `GET ${path}`).toBe(403);
    }
  });

  test('ADMIN can call admin APIs', async ({ admin }) => {
    for (const path of ADMIN_ENDPOINTS) {
      expect.soft((await admin.api.get(path)).status, `GET ${path}`).toBe(200);
    }
  });

  test('a revoked admin token is rejected by guarded admin controllers', async ({
    admin,
  }) => {
    await admin.api.post('v1/auth/logout', {});
    for (const path of ADMIN_ENDPOINTS) {
      expect.soft((await admin.api.get(path)).status, `GET ${path}`).toBe(401);
    }
  });

  test('tampering with the role claim invalidates the token', async ({
    anon,
    userA,
  }) => {
    // Swap the payload for one claiming ADMIN while keeping the old signature.
    const [header, payload] = userA.accessToken.split('.');
    const claims = JSON.parse(Buffer.from(payload, 'base64url').toString());
    const forgedPayload = Buffer.from(
      JSON.stringify({ ...claims, role: 'ADMIN' }),
    ).toString('base64url');
    const forged = `${header}.${forgedPayload}.${userA.accessToken.split('.')[2]}`;
    expect((await anon.as(forged).get('v1/admin/accounts')).status).toBe(401);
  });

  test('request bodies cannot name another account (accountId is not accepted)', async ({
    userA,
    userB,
  }) => {
    const cart = await userA.api.post('v1/cart/items', {
      productVariantId: randomId(),
      quantity: 1,
      accountId: userB.accountId,
    });
    expect(cart.status).toBe(400);

    const checkout = await userA.api.post(
      'v1/checkout',
      { accountId: userB.accountId },
      { headers: { 'Idempotency-Key': randomId() } },
    );
    expect(checkout.status).toBe(400);

    const deposit = await userA.api.post(
      'v1/deposits',
      { amount: '1000', accountId: userB.accountId },
      { headers: { 'Idempotency-Key': randomId() } },
    );
    expect(deposit.status).toBe(400);
  });

  test('orders list ignores an accountId filter supplied by a normal user', async ({
    userA,
    userB,
  }) => {
    const result = await userA.api.get('v1/orders', {
      params: { accountId: userB.accountId },
    });
    expect(result.status).toBe(200);
    for (const order of result.body.data.items) {
      expect(order.accountId).toBe(userA.accountId);
    }
  });
});

test.describe('B. RBAC - controllers without guards (BUG-002)', () => {
  test('anonymous cannot read back-office data', async ({ anon }) => {
    for (const path of INTERNAL_READ_ENDPOINTS) {
      expect.soft((await anon.get(path)).status, `GET ${path}`).toBe(401);
    }
  });

  test('USER cannot read back-office data', async ({ userA }) => {
    for (const path of INTERNAL_READ_ENDPOINTS) {
      expect.soft((await userA.api.get(path)).status, `GET ${path}`).toBe(403);
    }
  });

  test('SELLER cannot read admin-only analytics and purchase data', async ({
    seller,
  }) => {
    for (const path of INTERNAL_READ_ENDPOINTS.filter(
      (item) => item.startsWith('v1/analytics') || item.startsWith('v1/purchase'),
    )) {
      expect.soft((await seller.api.get(path)).status, `GET ${path}`).toBe(403);
    }
  });

  test('anonymous cannot call back-office mutations', async ({ anon }) => {
    for (const { method, path, body } of INTERNAL_MUTATIONS) {
      const result = await anon.call(method, path, { data: body });
      expect.soft(result.status, `${method} ${path}`).toBe(401);
    }
  });

  test('USER cannot call back-office mutations', async ({ userA }) => {
    for (const { method, path, body } of INTERNAL_MUTATIONS) {
      const result = await userA.api.call(method, path, { data: body });
      expect.soft(result.status, `${method} ${path}`).toBe(403);
    }
  });
});
