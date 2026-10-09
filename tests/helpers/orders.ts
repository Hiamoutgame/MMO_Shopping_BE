import { ApiClient, expectEnvelope } from './api-client';
import {
  addToCart,
  checkout,
  createSellableVariant,
  idempotencyKey,
  type SellableVariant,
} from './test-data';
import { fundWallet } from './wallet';

export interface PlacedOrder {
  order: any;
  item: SellableVariant;
}

/** Creates stock, funds the wallet with exactly the order total and checks out. */
export async function placeOrder(
  admin: ApiClient,
  anon: ApiClient,
  user: ApiClient,
  options: { price?: string; quantity?: number; fund?: string } = {},
): Promise<PlacedOrder> {
  const price = options.price ?? '100000';
  const quantity = options.quantity ?? 1;
  const item = await createSellableVariant(admin, { price, stock: quantity });
  await fundWallet(
    anon,
    user,
    options.fund ?? String(Number(price) * quantity),
  );
  await addToCart(user, item.variantId, quantity);
  const order = expectEnvelope(await checkout(user), 201).order;
  return { order, item };
}

export function refund(
  admin: ApiClient,
  orderId: string,
  body: Record<string, unknown> = {},
  key: string = idempotencyKey('refund'),
) {
  return admin.post(`v1/admin/orders/${orderId}/refund`, body, {
    headers: { 'Idempotency-Key': key },
  });
}
