import { ConfigService } from '@nestjs/config';

export interface SepayConfig {
  webhookApiKey: string | null;
  apiToken: string | null;
  apiBaseUrl: string;
  bankCode: string | null;
  accountNumber: string | null;
  accountHolder: string | null;
  paymentPrefix: string;
  minDepositAmount: number;
  depositExpiresMinutes: number;
  reconcileIntervalSeconds: number;
  reconcileLookbackHours: number;
}

function text(config: ConfigService, key: string): string | null {
  const value = config.get<string>(key);
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function int(config: ConfigService, key: string, fallback: number): number {
  const value = Number(config.get<string | number>(key));
  return Number.isInteger(value) && value >= 0 ? value : fallback;
}

// SePay chỉ nhận diện tiền tố 2–5 chữ cái; giá trị khác quay về MMO.
function prefix(value: string | null): string {
  return value && /^[A-Za-z]{2,5}$/.test(value) ? value.toUpperCase() : 'MMO';
}

/**
 * Đọc cấu hình SePay từ biến môi trường. Mọi biến đều tuỳ chọn: thiếu
 * tài khoản ngân hàng thì API tạo lệnh nạp trả 503, thiếu API key thì
 * webhook từ chối mọi request.
 */
export function readSepayConfig(config: ConfigService): SepayConfig {
  return {
    webhookApiKey: text(config, 'SEPAY_WEBHOOK_API_KEY'),
    apiToken: text(config, 'SEPAY_API_TOKEN'),
    apiBaseUrl:
      text(config, 'SEPAY_API_BASE_URL') ?? 'https://my.sepay.vn/userapi',
    bankCode: text(config, 'SEPAY_BANK_CODE'),
    accountNumber: text(config, 'SEPAY_ACCOUNT_NUMBER'),
    accountHolder: text(config, 'SEPAY_ACCOUNT_HOLDER'),
    paymentPrefix: prefix(text(config, 'SEPAY_PAYMENT_PREFIX')),
    minDepositAmount: int(config, 'SEPAY_MIN_DEPOSIT_AMOUNT', 10000),
    depositExpiresMinutes: int(config, 'SEPAY_DEPOSIT_EXPIRES_MINUTES', 30),
    reconcileIntervalSeconds: int(
      config,
      'SEPAY_RECONCILE_INTERVAL_SECONDS',
      0,
    ),
    reconcileLookbackHours: int(config, 'SEPAY_RECONCILE_LOOKBACK_HOURS', 24),
  };
}
