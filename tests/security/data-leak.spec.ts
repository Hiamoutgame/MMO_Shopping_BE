import { test, expect } from '../fixtures/auth.fixture';
import {
  expectEnvelope,
  expectNoSensitiveFields,
  unwrap,
} from '../helpers/api-client';
import { createSellableVariant } from '../helpers/test-data';

test.describe('Sensitive data exposure', () => {
  test('auth and admin account responses never contain password or token hashes', async ({
    admin,
    userA,
  }) => {
    expectNoSensitiveFields((await userA.api.get('v1/auth/me')).body);

    const list = await admin.api.get('v1/admin/accounts', {
      params: { search: userA.email },
    });
    const data = expectEnvelope(list, 200);
    expect(data.items.length).toBeGreaterThan(0);
    expectNoSensitiveFields(list.body);

    const one = await admin.api.get(`v1/admin/accounts/${userA.accountId}`);
    expectEnvelope(one, 200);
    expectNoSensitiveFields(one.body);
  });

  test('inventory payloads are never returned by admin or public catalog APIs', async ({
    admin,
    anon,
  }) => {
    const item = await createSellableVariant(admin.api, { stock: 1 });
    const secret = String(item.payloads[0].code);

    const list = await admin.api.get('v1/admin/inventory-items', {
      params: { productVariantId: item.variantId },
    });
    expectEnvelope(list, 200);
    expectNoSensitiveFields(list.body);
    expect(JSON.stringify(list.body)).not.toContain(secret);

    const one = await admin.api.get(
      `v1/admin/inventory-items/${item.inventoryItemIds[0]}`,
    );
    expectEnvelope(one, 200);
    expectNoSensitiveFields(one.body);
    expect(JSON.stringify(one.body)).not.toContain(secret);

    const product = await anon.get(`v1/products/${item.productId}`);
    expectEnvelope(product, 200);
    expect(JSON.stringify(product.body)).not.toContain(secret);
  });

  test.describe('BUG-001: seller profile endpoints expose account password hashes', () => {
    let profileId: string | undefined;

    test.afterEach(async ({ admin }) => {
      if (profileId) {
        await admin.api.delete(`v1/sellers/profiles/${profileId}`);
        profileId = undefined;
      }
    });

    test('seller profile responses must not embed the account password hash', async ({
      admin,
      seller,
      anon,
    }) => {
      const created = await admin.api.post('v1/sellers/profiles', {
        accountId: seller.accountId,
        businessName: 'e2e seller',
      });
      expect([200, 201]).toContain(created.status);
      profileId = unwrap(created.body).id;
      expect(profileId).toEqual(expect.any(String));

      const paths = [
        `v1/sellers/profiles/${profileId}`,
        `v1/sellers/profiles/by-account/${seller.accountId}`,
        'v1/sellers/profiles',
      ];

      // Even a legitimate admin response must not serialize credentials.
      for (const path of paths) {
        const result = await admin.api.get(path);
        expect.soft(result.status, `admin GET ${path}`).toBe(200);
        const serialized = JSON.stringify(result.body ?? null);
        expect
          .soft(serialized.includes('"passwordHash"'), `admin GET ${path} leaks passwordHash`)
          .toBe(false);
      }

      // And an anonymous caller must not reach the data at all.
      for (const path of paths) {
        const result = await anon.get(path);
        expect.soft(result.status, `anonymous GET ${path}`).toBe(401);
        const serialized = JSON.stringify(result.body ?? null);
        expect
          .soft(serialized.includes('"passwordHash"'), `anonymous GET ${path} leaks passwordHash`)
          .toBe(false);
        expect
          .soft(serialized.includes(seller.email), `anonymous GET ${path} leaks account email`)
          .toBe(false);
      }
    });
  });
});
