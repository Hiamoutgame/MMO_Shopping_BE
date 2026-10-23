import { test, expect } from '../fixtures/auth.fixture';
import { expectEnvelope } from '../helpers/api-client';
import { dbQuery } from '../helpers/db';
import {
  addToCart,
  cartItems,
  createProduct,
  createSellableVariant,
  createVariant,
  randomId,
} from '../helpers/test-data';

test.describe('C. Shopping cart', () => {
  test('user adds a variant, merges quantity, updates and removes it', async ({
    admin,
    userA,
  }) => {
    const item = await createSellableVariant(admin.api, { stock: 3 });

    const cart = await addToCart(userA.api, item.variantId, 1);
    expect(cart.accountId).toBe(userA.accountId);
    expect(cart.items).toHaveLength(1);
    expect(cart.items[0]).toMatchObject({
      productVariantId: item.variantId,
      quantity: 1,
      availableQuantity: 3,
      isAvailable: true,
    });
    expect(cart.items[0].variant.price).toBe('100000.0000');

    // Adding the same variant again merges into one line.
    const merged = await addToCart(userA.api, item.variantId, 2);
    expect(merged.items).toHaveLength(1);
    expect(merged.items[0].quantity).toBe(3);

    // Update quantity.
    const lineId = merged.items[0].id;
    const updated = await userA.api.patch(`v1/cart/items/${lineId}`, {
      quantity: 2,
    });
    expect(expectEnvelope(updated, 200).cart.items[0].quantity).toBe(2);

    // Quantity above stock is flagged as unavailable.
    const tooMany = await userA.api.patch(`v1/cart/items/${lineId}`, {
      quantity: 4,
    });
    expect(expectEnvelope(tooMany, 200).cart.items[0].isAvailable).toBe(false);

    // Database state mirrors the API.
    const rows = await dbQuery<{ quantity: number }>(
      `SELECT ci.quantity FROM cart_items ci
       JOIN carts c ON c.id = ci.cart_id WHERE c.account_id = $1`,
      [userA.accountId],
    );
    expect(rows).toEqual([{ quantity: 4 }]);

    const removed = await userA.api.delete(`v1/cart/items/${lineId}`);
    expect(expectEnvelope(removed, 200)).toEqual({ deleted: true });
    expect(await cartItems(userA.api)).toEqual([]);
  });

  test('quantity must be a positive integer on add and update', async ({
    admin,
    userA,
  }) => {
    const item = await createSellableVariant(admin.api, { stock: 1 });
    for (const quantity of [0, -1, -100, 1.5, '2x', null]) {
      const result = await userA.api.post('v1/cart/items', {
        productVariantId: item.variantId,
        quantity,
      });
      expect.soft(result.status, `add quantity=${String(quantity)}`).toBe(400);
    }
    expect(await cartItems(userA.api)).toEqual([]);

    const cart = await addToCart(userA.api, item.variantId, 1);
    const lineId = cart.items[0].id;
    for (const quantity of [0, -1, 1.5, null]) {
      const result = await userA.api.patch(`v1/cart/items/${lineId}`, {
        quantity,
      });
      expect.soft(result.status, `update quantity=${String(quantity)}`).toBe(400);
    }
    expect((await cartItems(userA.api))[0].quantity).toBe(1);
  });

  test('unknown, inactive and draft variants cannot be added', async ({
    admin,
    userA,
  }) => {
    const missing = await userA.api.post('v1/cart/items', {
      productVariantId: randomId(),
      quantity: 1,
    });
    expect(missing.status).toBe(404);

    const product = await createProduct(admin.api);
    const inactive = await createVariant(admin.api, product.id, {
      status: 'INACTIVE',
    });
    const inactiveResult = await userA.api.post('v1/cart/items', {
      productVariantId: inactive.id,
      quantity: 1,
    });
    expect(inactiveResult.status).toBe(404);

    const draftProduct = await createProduct(admin.api, { status: 'DRAFT' });
    const draftVariant = await createVariant(admin.api, draftProduct.id);
    const draftResult = await userA.api.post('v1/cart/items', {
      productVariantId: draftVariant.id,
      quantity: 1,
    });
    expect(draftResult.status).toBe(404);

    expect(await cartItems(userA.api)).toEqual([]);
  });

  test('IDOR: a user cannot read, update or delete another user cart item', async ({
    admin,
    userA,
    userB,
  }) => {
    const item = await createSellableVariant(admin.api, { stock: 2 });
    const cartA = await addToCart(userA.api, item.variantId, 1);
    const lineA = cartA.items[0].id;

    // B never sees A's cart.
    const cartB = expectEnvelope(await userB.api.get('v1/cart'), 200).cart;
    expect(cartB.accountId).toBe(userB.accountId);
    expect(cartB.id).not.toBe(cartA.id);
    expect(cartB.items).toEqual([]);

    const patch = await userB.api.patch(`v1/cart/items/${lineA}`, {
      quantity: 99,
    });
    expect(patch.status).toBe(404);

    const remove = await userB.api.delete(`v1/cart/items/${lineA}`);
    expect(remove.status).toBe(404);

    // A's line is untouched.
    const after = await cartItems(userA.api);
    expect(after).toHaveLength(1);
    expect(after[0]).toMatchObject({ id: lineA, quantity: 1 });
  });

  test('IDOR: voucher validation and checkout reject a foreign cartId', async ({
    admin,
    userA,
    userB,
  }) => {
    const item = await createSellableVariant(admin.api, { stock: 2 });
    const cartA = await addToCart(userA.api, item.variantId, 1);
    await addToCart(userB.api, item.variantId, 1);

    const validate = await userB.api.post('v1/vouchers/validate', {
      code: 'ANY',
      cartId: cartA.id,
    });
    expect(validate.status).toBe(403);

    const checkout = await userB.api.post(
      'v1/checkout',
      { cartId: cartA.id },
      { headers: { 'Idempotency-Key': randomId() } },
    );
    expect(checkout.status).toBe(403);
    expect(await cartItems(userA.api)).toHaveLength(1);
  });

  test('favorites are scoped to the current account', async ({
    admin,
    userA,
    userB,
  }) => {
    const product = await createProduct(admin.api);
    const added = await userA.api.post('v1/favorites', {
      productId: product.id,
    });
    expectEnvelope(added, 201);

    const listA = expectEnvelope(await userA.api.get('v1/favorites'), 200);
    expect(listA.favorites.map((f: any) => f.productId)).toContain(product.id);
    const listB = expectEnvelope(await userB.api.get('v1/favorites'), 200);
    expect(listB.favorites).toEqual([]);

    // B "removing" it must not affect A.
    const removeByB = await userB.api.delete(`v1/favorites/${product.id}`);
    expect(expectEnvelope(removeByB, 200)).toEqual({ deleted: false });
    const still = expectEnvelope(await userA.api.get('v1/favorites'), 200);
    expect(still.favorites).toHaveLength(1);
  });
});
