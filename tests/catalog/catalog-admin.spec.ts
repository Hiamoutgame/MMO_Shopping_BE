import { test, expect } from '../fixtures/auth.fixture';
import { expectEnvelope, expectNoSensitiveFields } from '../helpers/api-client';
import { dbQuery } from '../helpers/db';
import {
  createProduct,
  createVariant,
  inventoryStatuses,
  uniq,
} from '../helpers/test-data';

test.describe('C. Catalog - admin creates sellable products', () => {
  test('admin creates product -> variant -> inventory; user sees the product', async ({
    admin,
    anon,
    userA,
  }) => {
    // 1. product
    const slug = uniq('prod').replace(/_/g, '-');
    const productResult = await admin.api.post('v1/admin/products', {
      name: uniq('prod'),
      slug,
      description: 'e2e product',
      status: 'ACTIVE',
    });
    const product = expectEnvelope(productResult, 201).product;
    expect(product).toMatchObject({ slug, status: 'ACTIVE' });

    // 2. active variant
    const sku = uniq('sku');
    const variantResult = await admin.api.post(
      `v1/admin/products/${product.id}/variants`,
      {
        sku,
        name: 'e2e variant',
        price: '125000.5',
        fulfillmentType: 'AUTO',
        warrantyDays: 7,
      },
    );
    const variant = expectEnvelope(variantResult, 201).variant;
    expect(variant).toMatchObject({
      sku,
      price: '125000.5000',
      currency: 'VND',
      status: 'ACTIVE',
      fulfillmentType: 'AUTO',
      warrantyDays: 7,
    });

    // 3. inventory item
    const payload = { code: uniq('secret') };
    const inventoryResult = await admin.api.post('v1/admin/inventory-items', {
      productVariantId: variant.id,
      payload,
    });
    const inventory = expectEnvelope(inventoryResult, 201).inventoryItem;
    expect(inventory).toMatchObject({
      productVariantId: variant.id,
      status: 'AVAILABLE',
      orderItemId: null,
    });
    expectNoSensitiveFields(inventoryResult.body);
    expect(JSON.stringify(inventoryResult.body)).not.toContain(payload.code);

    // Database state: payload is stored encrypted, never in clear text.
    const [row] = await dbQuery<{ encrypted_payload: string; status: string }>(
      'SELECT encrypted_payload, status FROM inventory_items WHERE id = $1',
      [inventory.id],
    );
    expect(row.status).toBe('AVAILABLE');
    expect(row.encrypted_payload.startsWith('v1:')).toBe(true);
    expect(row.encrypted_payload).not.toContain(payload.code);

    // 4. anonymous and logged-in users see the product with its variant
    for (const client of [anon, userA.api]) {
      const result = await client.get(`v1/products/${product.id}`);
      const publicProduct = expectEnvelope(result, 200).product;
      expect(publicProduct.id).toBe(product.id);
      const serialized = JSON.stringify(publicProduct);
      expect(serialized).toContain(variant.id);
      expect(serialized).not.toContain(payload.code);
    }

    expect(await inventoryStatuses(admin.api, variant.id)).toEqual({
      AVAILABLE: 1,
    });
  });

  test('draft and inactive products are hidden from the public catalog', async ({
    admin,
    anon,
  }) => {
    const draft = await createProduct(admin.api, { status: 'DRAFT' });
    expect((await anon.get(`v1/products/${draft.id}`)).status).toBe(404);

    const active = await createProduct(admin.api);
    expect((await anon.get(`v1/products/${active.id}`)).status).toBe(200);
    const patched = await admin.api.patch(`v1/admin/products/${active.id}`, {
      status: 'INACTIVE',
    });
    expectEnvelope(patched, 200);
    expect((await anon.get(`v1/products/${active.id}`)).status).toBe(404);
  });

  test('only ADMIN can create products, variants and inventory', async ({
    admin,
    anon,
    userA,
    seller,
  }) => {
    const product = await createProduct(admin.api);
    const variant = await createVariant(admin.api, product.id);

    const attempts: [string, unknown][] = [
      ['v1/admin/products', { name: uniq('x') }],
      [
        `v1/admin/products/${product.id}/variants`,
        { sku: uniq('x'), name: 'x', price: '1', fulfillmentType: 'AUTO' },
      ],
      [
        'v1/admin/inventory-items',
        { productVariantId: variant.id, payload: { code: 'x' } },
      ],
    ];
    for (const [path, body] of attempts) {
      expect.soft((await anon.post(path, body)).status, `anon ${path}`).toBe(401);
      expect
        .soft((await userA.api.post(path, body)).status, `user ${path}`)
        .toBe(403);
      expect
        .soft((await seller.api.post(path, body)).status, `seller ${path}`)
        .toBe(403);
    }
    expect(await inventoryStatuses(admin.api, variant.id)).toEqual({});
  });

  test('variant validation: price, sku uniqueness, fulfillment type', async ({
    admin,
  }) => {
    const product = await createProduct(admin.api);
    const variant = await createVariant(admin.api, product.id);
    const path = `v1/admin/products/${product.id}/variants`;
    const base = { name: 'x', price: '1000', fulfillmentType: 'AUTO' };

    const negative = await admin.api.post(path, {
      ...base,
      sku: uniq('neg'),
      price: '-1',
    });
    expect.soft(negative.status, 'negative price').toBe(400);

    const notNumber = await admin.api.post(path, {
      ...base,
      sku: uniq('nan'),
      price: 'free',
    });
    expect.soft(notNumber.status, 'non numeric price').toBe(400);

    const duplicate = await admin.api.post(path, { ...base, sku: variant.sku });
    expect.soft([400, 409], 'duplicate sku').toContain(duplicate.status);

    const badType = await admin.api.post(path, {
      ...base,
      sku: uniq('type'),
      fulfillmentType: 'TELEPORT',
    });
    expect.soft(badType.status, 'bad fulfillment type').toBe(400);

    const currency = await admin.api.post(path, {
      ...base,
      sku: uniq('usd'),
      currency: 'USD',
    });
    expect.soft(currency.status, 'non VND currency').toBe(400);
  });

  test('inventory cannot be created for an unknown or inactive variant', async ({
    admin,
  }) => {
    const product = await createProduct(admin.api);
    const variant = await createVariant(admin.api, product.id, {
      status: 'INACTIVE',
    });
    const inactive = await admin.api.post('v1/admin/inventory-items', {
      productVariantId: variant.id,
      payload: { code: 'x' },
    });
    expect(inactive.status).toBe(404);

    const missingPayload = await admin.api.post('v1/admin/inventory-items', {
      productVariantId: variant.id,
    });
    expect(missingPayload.status).toBe(400);
  });

  test('inventory status transitions are enforced', async ({ admin }) => {
    const product = await createProduct(admin.api);
    const variant = await createVariant(admin.api, product.id);
    const created = await admin.api.post('v1/admin/inventory-items', {
      productVariantId: variant.id,
      payload: { code: uniq('c') },
    });
    const id = expectEnvelope(created, 201).inventoryItem.id;

    const toSold = await admin.api.patch(`v1/admin/inventory-items/${id}`, {
      status: 'SOLD',
    });
    expect(toSold.status).toBe(400);

    const toVoid = await admin.api.patch(`v1/admin/inventory-items/${id}`, {
      status: 'VOID',
    });
    expectEnvelope(toVoid, 200);

    const backToAvailable = await admin.api.patch(
      `v1/admin/inventory-items/${id}`,
      { status: 'AVAILABLE' },
    );
    expect(backToAvailable.status).toBe(400);
  });
});
