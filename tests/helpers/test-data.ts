import { randomBytes, randomUUID } from 'crypto';
import { expect } from '@playwright/test';
import { ApiClient, expectEnvelope } from './api-client';

/** Every row created by the suite carries this prefix. */
export const E2E_PREFIX = 'e2e';

export function rand(bytes = 4): string {
  return randomBytes(bytes).toString('hex');
}

export function uniq(label: string): string {
  return `${E2E_PREFIX}_${Date.now()}_${rand()}_${label}`;
}

export function uniqEmail(label = 'user'): string {
  return `${uniq(label)}@example.test`.toLowerCase();
}

/** Voucher codes are stored upper-case and limited to 50 chars. */
export function uniqVoucherCode(label = 'V'): string {
  return `E2E_${Date.now()}_${rand().toUpperCase()}_${label}`.slice(0, 50);
}

export function idempotencyKey(label = 'key'): string {
  return uniq(label);
}

export function randomId(): string {
  return randomUUID();
}

export function isoFromNow(ms: number): string {
  return new Date(Date.now() + ms).toISOString();
}

export const HOUR = 60 * 60 * 1000;
export const DAY = 24 * HOUR;

export interface SellableVariant {
  productId: string;
  variantId: string;
  sku: string;
  price: string;
  inventoryItemIds: string[];
  payloads: Record<string, unknown>[];
}

export async function createProduct(
  admin: ApiClient,
  overrides: Record<string, unknown> = {},
): Promise<{ id: string; slug: string }> {
  const slug = uniq('product').replace(/_/g, '-');
  const result = await admin.post('v1/admin/products', {
    name: uniq('product'),
    slug,
    status: 'ACTIVE',
    ...overrides,
  });
  const data = expectEnvelope(result, 201);
  return { id: data.product.id, slug: data.product.slug };
}

export async function createVariant(
  admin: ApiClient,
  productId: string,
  overrides: Record<string, unknown> = {},
): Promise<{ id: string; sku: string; price: string }> {
  const sku = uniq('sku');
  const result = await admin.post(`v1/admin/products/${productId}/variants`, {
    sku,
    name: uniq('variant'),
    price: '100000',
    fulfillmentType: 'AUTO',
    ...overrides,
  });
  const data = expectEnvelope(result, 201);
  return { id: data.variant.id, sku, price: data.variant.price };
}

export async function createInventory(
  admin: ApiClient,
  variantId: string,
  count: number,
): Promise<{ ids: string[]; payloads: Record<string, unknown>[] }> {
  const ids: string[] = [];
  const payloads: Record<string, unknown>[] = [];
  for (let index = 0; index < count; index += 1) {
    const payload = { code: uniq(`code${index}`) };
    const result = await admin.post('v1/admin/inventory-items', {
      productVariantId: variantId,
      payload,
    });
    const data = expectEnvelope(result, 201);
    ids.push(data.inventoryItem.id);
    payloads.push(payload);
  }
  return { ids, payloads };
}

/** Active product + active AUTO variant + `stock` AVAILABLE inventory items. */
export async function createSellableVariant(
  admin: ApiClient,
  options: {
    price?: string;
    stock?: number;
    variant?: Record<string, unknown>;
    product?: Record<string, unknown>;
  } = {},
): Promise<SellableVariant> {
  const product = await createProduct(admin, options.product);
  const variant = await createVariant(admin, product.id, {
    price: options.price ?? '100000',
    ...(options.variant || {}),
  });
  const inventory = await createInventory(
    admin,
    variant.id,
    options.stock ?? 1,
  );
  return {
    productId: product.id,
    variantId: variant.id,
    sku: variant.sku,
    price: variant.price,
    inventoryItemIds: inventory.ids,
    payloads: inventory.payloads,
  };
}

export async function addToCart(
  user: ApiClient,
  variantId: string,
  quantity = 1,
) {
  const result = await user.post('v1/cart/items', {
    productVariantId: variantId,
    quantity,
  });
  return expectEnvelope(result, 201).cart;
}

export async function createVoucher(
  admin: ApiClient,
  overrides: Record<string, unknown> = {},
) {
  const result = await admin.post('v1/admin/vouchers', {
    code: uniqVoucherCode(),
    name: uniq('voucher'),
    discountType: 'PERCENTAGE',
    discountValue: '10',
    usageLimit: 100,
    perAccountLimit: 1,
    startsAt: isoFromNow(-HOUR),
    endsAt: isoFromNow(DAY),
    ...overrides,
  });
  return expectEnvelope(result, 201).voucher as {
    id: string;
    code: string;
    usedCount: number;
  };
}

export async function inventoryStatuses(
  admin: ApiClient,
  variantId: string,
): Promise<Record<string, number>> {
  const result = await admin.get('v1/admin/inventory-items', {
    params: { productVariantId: variantId, pageSize: 100 },
  });
  const data = expectEnvelope(result, 200);
  const counts: Record<string, number> = {};
  for (const item of data.items as { status: string }[]) {
    counts[item.status] = (counts[item.status] || 0) + 1;
  }
  return counts;
}

export async function walletBalance(user: ApiClient): Promise<string> {
  const result = await user.get('v1/wallet');
  return expectEnvelope(result, 200).wallet.balance as string;
}

export async function cartItems(user: ApiClient) {
  const result = await user.get('v1/cart');
  return expectEnvelope(result, 200).cart.items as {
    id: string;
    productVariantId: string;
    quantity: number;
  }[];
}

export async function checkout(
  user: ApiClient,
  body: Record<string, unknown> = {},
  key: string = idempotencyKey('checkout'),
) {
  return user.post('v1/checkout', body, {
    headers: { 'Idempotency-Key': key },
  });
}

export function expectStatus(result: { status: number }, status: number) {
  expect(result.status).toBe(status);
}
