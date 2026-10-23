import { test, expect } from '../fixtures/auth.fixture';
import { expectEnvelope, expectNoSensitiveFields } from '../helpers/api-client';
import { dbQuery } from '../helpers/db';
import {
  addToCart,
  cartItems,
  checkout,
  createInventory,
  createProduct,
  createSellableVariant,
  createVariant,
  idempotencyKey,
  inventoryStatuses,
  walletBalance,
} from '../helpers/test-data';
import {
  createDeposit,
  fundWallet,
  sendPaymentCallback,
} from '../helpers/wallet';

async function orderCount(accountId: string): Promise<number> {
  const [row] = await dbQuery<{ count: string }>(
    'SELECT COUNT(*) AS count FROM orders WHERE account_id = $1',
    [accountId],
  );
  return Number(row.count);
}

test.describe('C. Checkout flow', () => {
  test('successful checkout creates the order, sells inventory, clears the cart and debits the wallet', async ({
    admin,
    anon,
    userA,
    userB,
  }) => {
    const item = await createSellableVariant(admin.api, {
      price: '100000',
      stock: 3,
    });
    await fundWallet(anon, userA.api, '500000');
    await addToCart(userA.api, item.variantId, 2);

    const result = await checkout(userA.api);
    const order = expectEnvelope(result, 201).order;

    // order + order item
    expect(order).toMatchObject({
      accountId: userA.accountId,
      status: 'COMPLETED',
      paymentStatus: 'PAID',
      subtotal: '200000.0000',
      discountAmount: '0.0000',
      totalAmount: '200000.0000',
      refundedAmount: '0.0000',
      currency: 'VND',
      voucherId: null,
    });
    expect(order.items).toHaveLength(1);
    expect(order.items[0]).toMatchObject({
      productVariantId: item.variantId,
      sku: item.sku,
      unitPrice: '100000.0000',
      quantity: 2,
      totalAmount: '200000.0000',
    });

    // delivery payload: exactly the two oldest inventory items, decrypted
    expect(order.items[0].deliveryPayload).toHaveLength(2);
    expect(order.items[0].deliveryPayload).toEqual(
      expect.arrayContaining(item.payloads.slice(0, 2)),
    );
    expectNoSensitiveFields(result.body);

    // inventory AVAILABLE -> RESERVED -> SOLD (nothing left RESERVED)
    expect(await inventoryStatuses(admin.api, item.variantId)).toEqual({
      SOLD: 2,
      AVAILABLE: 1,
    });
    const inventoryRows = await dbQuery<{
      status: string;
      order_item_id: string | null;
      reserved_until: Date | null;
      sold_at: Date | null;
    }>(
      `SELECT status, order_item_id, reserved_until, sold_at
       FROM inventory_items WHERE product_variant_id = $1 ORDER BY created_at`,
      [item.variantId],
    );
    expect(inventoryRows.map((row) => row.status)).toEqual([
      'SOLD',
      'SOLD',
      'AVAILABLE',
    ]);
    for (const row of inventoryRows.slice(0, 2)) {
      expect(row.order_item_id).toBe(order.items[0].id);
      expect(row.sold_at).not.toBeNull();
      expect(row.reserved_until).toBeNull();
    }
    expect(inventoryRows[2].order_item_id).toBeNull();

    // cart cleared, wallet debited exactly once
    expect(await cartItems(userA.api)).toEqual([]);
    expect(await walletBalance(userA.api)).toBe('300000.0000');
    const ledger = expectEnvelope(
      await userA.api.get('v1/wallet-transactions'),
      200,
    );
    const debits = ledger.items.filter((tx: any) => tx.orderId === order.id);
    expect(debits).toHaveLength(1);
    expect(debits[0]).toMatchObject({
      type: 'DEBIT',
      amount: '200000.0000',
      balanceBefore: '500000.0000',
      balanceAfter: '300000.0000',
      purpose: 'ORDER_PAYMENT',
    });

    // database rows
    const [dbOrder] = await dbQuery<{ total_amount: string; items: string }>(
      `SELECT o.total_amount,
              (SELECT COUNT(*) FROM order_items WHERE order_id = o.id) AS items
       FROM orders o WHERE o.id = $1`,
      [order.id],
    );
    expect(dbOrder.total_amount).toBe('200000.0000');
    expect(Number(dbOrder.items)).toBe(1);

    // delivery payload visibility: owner yes, other user no, admin no
    const own = expectEnvelope(await userA.api.get(`v1/orders/${order.id}`), 200);
    expect(own.order.items[0].deliveryPayload).toEqual(
      expect.arrayContaining(item.payloads.slice(0, 2)),
    );

    const other = await userB.api.get(`v1/orders/${order.id}`);
    expect(other.status).toBe(404);
    const otherList = expectEnvelope(await userB.api.get('v1/orders'), 200);
    expect(otherList.items).toEqual([]);

    const adminView = await admin.api.get(`v1/admin/orders/${order.id}`);
    const adminOrder = expectEnvelope(adminView, 200).order;
    expect(adminOrder.items[0].deliveryPayload).toBeUndefined();
    for (const payload of item.payloads) {
      expect(JSON.stringify(adminView.body)).not.toContain(String(payload.code));
    }

    const list = expectEnvelope(await userA.api.get('v1/orders'), 200);
    expect(list.items.map((entry: any) => entry.id)).toEqual([order.id]);
    for (const payload of item.payloads) {
      expect(JSON.stringify(list)).not.toContain(String(payload.code));
    }
  });

  test('checkout without Idempotency-Key is rejected and changes nothing', async ({
    admin,
    anon,
    userA,
  }) => {
    const item = await createSellableVariant(admin.api, { stock: 1 });
    await fundWallet(anon, userA.api, '100000');
    await addToCart(userA.api, item.variantId, 1);

    const result = await userA.api.post('v1/checkout', {});
    expect(result.status).toBe(400);
    expect(await orderCount(userA.accountId)).toBe(0);
    expect(await walletBalance(userA.api)).toBe('100000.0000');
    expect(await inventoryStatuses(admin.api, item.variantId)).toEqual({
      AVAILABLE: 1,
    });
  });

  test('same Idempotency-Key + same body replays the first result', async ({
    admin,
    anon,
    userA,
  }) => {
    const item = await createSellableVariant(admin.api, { stock: 2 });
    await fundWallet(anon, userA.api, '300000');
    await addToCart(userA.api, item.variantId, 1);
    const key = idempotencyKey('replay');

    const first = await checkout(userA.api, {}, key);
    const order = expectEnvelope(first, 201).order;

    // Refill the cart: a replay must not sell it.
    await addToCart(userA.api, item.variantId, 1);
    const second = await checkout(userA.api, {}, key);
    expect(expectEnvelope(second, 201).order).toEqual(order);

    expect(await orderCount(userA.accountId)).toBe(1);
    expect(await walletBalance(userA.api)).toBe('200000.0000');
    expect(await inventoryStatuses(admin.api, item.variantId)).toEqual({
      SOLD: 1,
      AVAILABLE: 1,
    });
    expect(await cartItems(userA.api)).toHaveLength(1);
  });

  test('same Idempotency-Key + different body is rejected', async ({
    admin,
    anon,
    userA,
  }) => {
    const item = await createSellableVariant(admin.api, { stock: 2 });
    await fundWallet(anon, userA.api, '300000');
    await addToCart(userA.api, item.variantId, 1);
    const key = idempotencyKey('conflict');

    expectEnvelope(await checkout(userA.api, {}, key), 201);
    await addToCart(userA.api, item.variantId, 1);

    const conflict = await checkout(userA.api, { voucherCode: 'OTHER' }, key);
    expect(conflict.status).toBe(409);
    expect(await orderCount(userA.accountId)).toBe(1);
    expect(await walletBalance(userA.api)).toBe('200000.0000');
  });

  test('an Idempotency-Key of one account cannot be replayed by another', async ({
    admin,
    anon,
    userA,
    userB,
  }) => {
    const item = await createSellableVariant(admin.api, { stock: 2 });
    await fundWallet(anon, userA.api, '100000');
    await fundWallet(anon, userB.api, '100000');
    await addToCart(userA.api, item.variantId, 1);
    await addToCart(userB.api, item.variantId, 1);
    const key = idempotencyKey('shared');

    const first = expectEnvelope(await checkout(userA.api, {}, key), 201).order;
    const second = await checkout(userB.api, {}, key);
    expect(second.status).toBe(409);
    expect(JSON.stringify(second.body)).not.toContain(first.id);
    expect(await orderCount(userB.accountId)).toBe(0);
    expect(await walletBalance(userB.api)).toBe('100000.0000');
  });

  test('BUG-014: two concurrent requests with the same Idempotency-Key produce one order and two identical responses', async ({
    admin,
    anon,
    userA,
  }) => {
    const item = await createSellableVariant(admin.api, { stock: 2 });
    await fundWallet(anon, userA.api, '300000');
    await addToCart(userA.api, item.variantId, 1);
    const key = idempotencyKey('race');

    const [one, two] = await Promise.all([
      checkout(userA.api, {}, key),
      checkout(userA.api, {}, key),
    ]);

    // Whatever the responses are, money and stock must move exactly once.
    expect(await orderCount(userA.accountId)).toBe(1);
    expect(await walletBalance(userA.api)).toBe('200000.0000');
    expect(await inventoryStatuses(admin.api, item.variantId)).toEqual({
      SOLD: 1,
      AVAILABLE: 1,
    });

    // Contract: the second request is a replay, not an error.
    expect([one.status, two.status]).toEqual([201, 201]);
    expect(two.body.data.order.id).toBe(one.body.data.order.id);
  });

  test('two users racing for the last inventory item: exactly one wins', async ({
    admin,
    anon,
    userA,
    userB,
  }) => {
    const item = await createSellableVariant(admin.api, { stock: 1 });
    await fundWallet(anon, userA.api, '100000');
    await fundWallet(anon, userB.api, '100000');
    await addToCart(userA.api, item.variantId, 1);
    await addToCart(userB.api, item.variantId, 1);

    const results = await Promise.all([
      checkout(userA.api),
      checkout(userB.api),
    ]);
    const statuses = results.map((result) => result.status).sort();
    expect(statuses).toEqual([201, 400]);

    expect(await inventoryStatuses(admin.api, item.variantId)).toEqual({
      SOLD: 1,
    });

    const sessions = [userA, userB];
    const winner = sessions[results.findIndex((r) => r.status === 201)];
    const loser = sessions[results.findIndex((r) => r.status === 400)];

    expect(await walletBalance(winner.api)).toBe('0.0000');
    expect(await orderCount(winner.accountId)).toBe(1);
    expect(await cartItems(winner.api)).toEqual([]);

    // Loser is fully rolled back.
    expect(await walletBalance(loser.api)).toBe('100000.0000');
    expect(await orderCount(loser.accountId)).toBe(0);
    expect(await cartItems(loser.api)).toHaveLength(1);

    // The single inventory item belongs to exactly one order item.
    const sold = await dbQuery<{ order_item_id: string }>(
      'SELECT order_item_id FROM inventory_items WHERE product_variant_id = $1',
      [item.variantId],
    );
    expect(sold).toHaveLength(1);
    expect(sold[0].order_item_id).toBe(
      results.find((r) => r.status === 201)!.body.data.order.items[0].id,
    );
  });

  test('many buyers, limited stock: never oversells', async ({
    admin,
    anon,
    userA,
    userB,
  }) => {
    // Each user wants 2 units, only 3 exist.
    const item = await createSellableVariant(admin.api, { stock: 3 });
    for (const user of [userA, userB]) {
      await fundWallet(anon, user.api, '200000');
      await addToCart(user.api, item.variantId, 2);
    }
    const results = await Promise.all([
      checkout(userA.api),
      checkout(userB.api),
    ]);
    expect(results.map((r) => r.status).sort()).toEqual([201, 400]);
    expect(await inventoryStatuses(admin.api, item.variantId)).toEqual({
      SOLD: 2,
      AVAILABLE: 1,
    });
    const balances = [
      await walletBalance(userA.api),
      await walletBalance(userB.api),
    ].sort();
    expect(balances).toEqual(['0.0000', '200000.0000']);
  });

  test('double submit with two different keys buys the cart only once', async ({
    admin,
    anon,
    userA,
  }) => {
    const item = await createSellableVariant(admin.api, { stock: 2 });
    await fundWallet(anon, userA.api, '300000');
    await addToCart(userA.api, item.variantId, 1);

    const results = await Promise.all([
      checkout(userA.api),
      checkout(userA.api),
    ]);
    expect(results.map((r) => r.status).sort()).toEqual([201, 400]);
    expect(await orderCount(userA.accountId)).toBe(1);
    expect(await walletBalance(userA.api)).toBe('200000.0000');
    expect(await inventoryStatuses(admin.api, item.variantId)).toEqual({
      SOLD: 1,
      AVAILABLE: 1,
    });
  });

  test('checkout with an empty cart is rejected', async ({ userA }) => {
    const result = await checkout(userA.api);
    expect(result.status).toBe(400);
    expect(await orderCount(userA.accountId)).toBe(0);
  });

  test('checkout fails when stock is lower than the cart quantity', async ({
    admin,
    anon,
    userA,
  }) => {
    const item = await createSellableVariant(admin.api, { stock: 1 });
    await fundWallet(anon, userA.api, '300000');
    await addToCart(userA.api, item.variantId, 2);

    const result = await checkout(userA.api);
    expect(result.status).toBe(400);
    expect(await orderCount(userA.accountId)).toBe(0);
    expect(await walletBalance(userA.api)).toBe('300000.0000');
    expect(await inventoryStatuses(admin.api, item.variantId)).toEqual({
      AVAILABLE: 1,
    });
    expect(await cartItems(userA.api)).toHaveLength(1);
  });

  test('checkout rejects a variant that became inactive', async ({
    admin,
    anon,
    userA,
  }) => {
    const item = await createSellableVariant(admin.api, { stock: 1 });
    await fundWallet(anon, userA.api, '100000');
    await addToCart(userA.api, item.variantId, 1);
    expectEnvelope(
      await admin.api.patch(`v1/admin/variants/${item.variantId}`, {
        status: 'INACTIVE',
      }),
      200,
    );

    const result = await checkout(userA.api);
    expect(result.status).toBe(400);
    expect(await orderCount(userA.accountId)).toBe(0);
    expect(await walletBalance(userA.api)).toBe('100000.0000');
    expect(await inventoryStatuses(admin.api, item.variantId)).toEqual({
      AVAILABLE: 1,
    });
  });

  test('checkout rejects a product that became inactive', async ({
    admin,
    anon,
    userA,
  }) => {
    const item = await createSellableVariant(admin.api, { stock: 1 });
    await fundWallet(anon, userA.api, '100000');
    await addToCart(userA.api, item.variantId, 1);
    expectEnvelope(
      await admin.api.patch(`v1/admin/products/${item.productId}`, {
        status: 'INACTIVE',
      }),
      200,
    );

    const result = await checkout(userA.api);
    expect(result.status).toBe(400);
    expect(await orderCount(userA.accountId)).toBe(0);
    expect(await walletBalance(userA.api)).toBe('100000.0000');
  });

  for (const fulfillmentType of ['MANUAL', 'EXTERNAL']) {
    test(`checkout rejects unsupported fulfillment type ${fulfillmentType}`, async ({
      admin,
      anon,
      userA,
    }) => {
      const product = await createProduct(admin.api);
      const variant = await createVariant(admin.api, product.id, {
        fulfillmentType,
      });
      await createInventory(admin.api, variant.id, 1);
      await fundWallet(anon, userA.api, '100000');
      await addToCart(userA.api, variant.id, 1);

      const result = await checkout(userA.api);
      expect(result.status).toBe(400);
      expect(await orderCount(userA.accountId)).toBe(0);
      expect(await walletBalance(userA.api)).toBe('100000.0000');
      expect(await inventoryStatuses(admin.api, variant.id)).toEqual({
        AVAILABLE: 1,
      });
    });
  }
});

test.describe('D. Money and wallet', () => {
  test('insufficient balance rolls back order, inventory, cart and wallet', async ({
    admin,
    anon,
    userA,
  }) => {
    const item = await createSellableVariant(admin.api, {
      price: '100000',
      stock: 2,
    });
    await fundWallet(anon, userA.api, '199999.9999');
    await addToCart(userA.api, item.variantId, 2);

    const result = await checkout(userA.api);
    expect(result.status).toBe(400);

    expect(await orderCount(userA.accountId)).toBe(0);
    expect(await inventoryStatuses(admin.api, item.variantId)).toEqual({
      AVAILABLE: 2,
    });
    const cart = await cartItems(userA.api);
    expect(cart).toHaveLength(1);
    expect(cart[0].quantity).toBe(2);
    expect(await walletBalance(userA.api)).toBe('199999.9999');
    const ledger = expectEnvelope(
      await userA.api.get('v1/wallet-transactions'),
      200,
    );
    expect(ledger.items.filter((tx: any) => tx.type === 'DEBIT')).toEqual([]);
  });

  test('paying with exactly the available balance leaves 0.0000', async ({
    admin,
    anon,
    userA,
  }) => {
    const item = await createSellableVariant(admin.api, {
      price: '100000',
      stock: 1,
    });
    await fundWallet(anon, userA.api, '100000');
    await addToCart(userA.api, item.variantId, 1);
    expectEnvelope(await checkout(userA.api), 201);
    expect(await walletBalance(userA.api)).toBe('0.0000');
  });

  const precisionCases: {
    price: string;
    quantity: number;
    subtotal: string;
  }[] = [
    { price: '0.1', quantity: 3, subtotal: '0.3000' },
    { price: '19.99', quantity: 3, subtotal: '59.9700' },
    { price: '33333.3333', quantity: 3, subtotal: '99999.9999' },
    { price: '1234567.8901', quantity: 2, subtotal: '2469135.7802' },
  ];
  for (const { price, quantity, subtotal } of precisionCases) {
    test(`decimal precision: ${price} x ${quantity} = ${subtotal}`, async ({
      admin,
      anon,
      userA,
    }) => {
      const item = await createSellableVariant(admin.api, {
        price,
        stock: quantity,
      });
      await fundWallet(anon, userA.api, '3000000');
      await addToCart(userA.api, item.variantId, quantity);

      const order = expectEnvelope(await checkout(userA.api), 201).order;
      expect(order.subtotal).toBe(subtotal);
      expect(order.discountAmount).toBe('0.0000');
      expect(order.totalAmount).toBe(subtotal);
      expect(order.items[0].totalAmount).toBe(subtotal);

      const ledger = expectEnvelope(
        await userA.api.get('v1/wallet-transactions'),
        200,
      );
      const debit = ledger.items.find((tx: any) => tx.orderId === order.id);
      expect(debit.amount).toBe(subtotal);
      // balanceBefore - amount === balanceAfter, checked as integers (x 10^4)
      const scaled = (value: string) => BigInt(value.replace('.', ''));
      expect(scaled(debit.balanceBefore) - scaled(debit.amount)).toBe(
        scaled(debit.balanceAfter),
      );
    });
  }

  test('multi-line cart: subtotal is the exact sum of the lines', async ({
    admin,
    anon,
    userA,
  }) => {
    const first = await createSellableVariant(admin.api, {
      price: '0.7',
      stock: 3,
    });
    const second = await createSellableVariant(admin.api, {
      price: '0.1',
      stock: 1,
    });
    await fundWallet(anon, userA.api, '100');
    await addToCart(userA.api, first.variantId, 3);
    await addToCart(userA.api, second.variantId, 1);

    const order = expectEnvelope(await checkout(userA.api), 201).order;
    // 0.7 * 3 + 0.1 = 2.2 (binary floating point gives 2.1999999999999997)
    expect(order.subtotal).toBe('2.2000');
    expect(order.totalAmount).toBe('2.2000');
    expect(order.items).toHaveLength(2);
    expect(await walletBalance(userA.api)).toBe('97.8000');
  });

  test('deposit: callback credits once, replays are idempotent, bad signatures are rejected', async ({
    anon,
    userA,
  }) => {
    const payment = await createDeposit(userA.api, '50000');
    expect(payment.status).toBe('PENDING');
    expect(await walletBalance(userA.api)).toBe('0.0000');

    const body = {
      merchantReference: payment.merchantReference,
      providerTransactionId: idempotencyKey('ptx'),
      amount: payment.amount,
      currency: 'VND',
      status: 'SUCCEEDED',
    };

    const forged = await sendPaymentCallback(anon, body, {
      signature: 'deadbeef',
    });
    expect(forged.status).toBe(401);
    const unsigned = await anon.post(
      'v1/callbacks/payment-providers/BANK_TRANSFER',
      body,
    );
    expect(unsigned.status).toBe(401);
    const stale = await sendPaymentCallback(anon, body, {
      timestamp: String(Date.now() - 60 * 60 * 1000),
    });
    expect(stale.status).toBe(401);
    expect(await walletBalance(userA.api)).toBe('0.0000');

    const wrongAmount = await sendPaymentCallback(anon, {
      ...body,
      providerTransactionId: idempotencyKey('ptx'),
      amount: '5000000',
    });
    expect(wrongAmount.status).toBe(409);
    expect(await walletBalance(userA.api)).toBe('0.0000');

    expectEnvelope(await sendPaymentCallback(anon, body), 201);
    expect(await walletBalance(userA.api)).toBe('50000.0000');

    // Provider retry of the same transaction.
    expectEnvelope(await sendPaymentCallback(anon, body), 201);
    expect(await walletBalance(userA.api)).toBe('50000.0000');

    // A second provider transaction id for the same deposit must not credit again.
    await sendPaymentCallback(anon, {
      ...body,
      providerTransactionId: idempotencyKey('ptx'),
    });
    expect(await walletBalance(userA.api)).toBe('50000.0000');
  });

  test('BUG-011: a late FAILED callback must not flip an already credited deposit', async ({
    anon,
    userA,
  }) => {
    const payment = await createDeposit(userA.api, '70000');
    const base = {
      merchantReference: payment.merchantReference,
      amount: payment.amount,
      currency: 'VND',
    };
    expectEnvelope(
      await sendPaymentCallback(anon, {
        ...base,
        providerTransactionId: idempotencyKey('ptx'),
        status: 'SUCCEEDED',
      }),
      201,
    );
    expect(await walletBalance(userA.api)).toBe('70000.0000');

    const late = await sendPaymentCallback(anon, {
      ...base,
      providerTransactionId: idempotencyKey('ptx'),
      status: 'FAILED',
    });
    expect.soft([400, 409], 'late callback is rejected').toContain(late.status);

    // Money was credited, so the payment must still read SUCCEEDED.
    const [row] = await dbQuery<{ status: string }>(
      'SELECT status FROM payment_transactions WHERE id = $1',
      [payment.id],
    );
    expect(row.status).toBe('SUCCEEDED');
    expect(await walletBalance(userA.api)).toBe('70000.0000');
  });
});
