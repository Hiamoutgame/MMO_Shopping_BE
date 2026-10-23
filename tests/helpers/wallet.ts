import { createHmac } from 'crypto';
import { ApiClient, expectEnvelope } from './api-client';
import { idempotencyKey, uniq } from './test-data';

function callbackSecret(): string {
  const value = process.env.PAYMENT_CALLBACK_SECRET;
  if (!value) {
    throw new Error('Missing PAYMENT_CALLBACK_SECRET (expected in .env.test)');
  }
  return value;
}

/** Same scheme as CryptoService.signHmac: HMAC-SHA256(`${timestamp}.` + body). */
export function signCallback(rawBody: string, timestamp: string): string {
  return createHmac('sha256', callbackSecret())
    .update(`${timestamp}.`)
    .update(rawBody)
    .digest('hex');
}

export async function createDeposit(user: ApiClient, amount: string) {
  const result = await user.post(
    'v1/deposits',
    { amount },
    { headers: { 'Idempotency-Key': idempotencyKey('deposit') } },
  );
  return expectEnvelope(result, 201).paymentTransaction as {
    id: string;
    merchantReference: string;
    amount: string;
    currency: string;
    status: string;
  };
}

export async function sendPaymentCallback(
  anon: ApiClient,
  body: Record<string, unknown>,
  options: { timestamp?: string; signature?: string } = {},
) {
  const timestamp = options.timestamp ?? String(Date.now());
  const signature =
    options.signature ?? signCallback(JSON.stringify(body), timestamp);
  return anon.post('v1/callbacks/payment-providers/BANK_TRANSFER', body, {
    headers: {
      'x-payment-timestamp': timestamp,
      'x-payment-signature': signature,
    },
  });
}

/** Credits the wallet through the real deposit + signed provider callback flow. */
export async function fundWallet(
  anon: ApiClient,
  user: ApiClient,
  amount: string,
): Promise<void> {
  const payment = await createDeposit(user, amount);
  const result = await sendPaymentCallback(anon, {
    merchantReference: payment.merchantReference,
    providerTransactionId: uniq('ptx'),
    amount: payment.amount,
    currency: payment.currency,
    status: 'SUCCEEDED',
  });
  expectEnvelope(result, 201);
}
