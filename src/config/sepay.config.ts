import { registerAs } from '@nestjs/config';

function toInt(value: string | undefined, fallback: number): number {
  const parsed = parseInt(value ?? '', 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export interface SepayConfig {
  webhookApiKey: string;
  apiToken: string;
  apiBaseUrl: string;
  qrBaseUrl: string;
  bankCode: string;
  accountNumber: string;
  accountHolder: string;
  paymentPrefix: string;
  autoSyncIntervalMs: number;
  depositMinAmount: number;
  depositMaxAmount: number;
  depositExpiresMinutes: number;
  maxPendingDeposits: number;
}

export default registerAs('sepay', (): SepayConfig => ({
  webhookApiKey: process.env.SEPAY_WEBHOOK_API_KEY?.trim() || '',
  apiToken: process.env.SEPAY_API_TOKEN?.trim() || '',
  apiBaseUrl: process.env.SEPAY_API_BASE_URL || 'https://my.sepay.vn',
  qrBaseUrl: process.env.SEPAY_QR_BASE_URL || 'https://qr.sepay.vn/img',
  bankCode: process.env.SEPAY_BANK_CODE?.trim() || '',
  accountNumber: process.env.SEPAY_ACCOUNT_NUMBER?.trim() || '',
  accountHolder: process.env.SEPAY_ACCOUNT_HOLDER?.trim() || '',
  paymentPrefix: (process.env.SEPAY_PAYMENT_PREFIX || 'MMO')
    .trim()
    .toUpperCase(),
  autoSyncIntervalMs: toInt(process.env.SEPAY_AUTO_SYNC_INTERVAL_MS, 0),
  depositMinAmount: toInt(process.env.DEPOSIT_MIN_AMOUNT, 10000),
  depositMaxAmount: toInt(process.env.DEPOSIT_MAX_AMOUNT, 1_000_000_000),
  depositExpiresMinutes: toInt(process.env.DEPOSIT_EXPIRES_MINUTES, 30),
  maxPendingDeposits: toInt(process.env.DEPOSIT_MAX_PENDING, 5),
}));
