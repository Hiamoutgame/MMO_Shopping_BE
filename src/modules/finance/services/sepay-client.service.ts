import {
  BadRequestException,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash, randomInt, timingSafeEqual } from 'crypto';
import type { SepayConfig } from '../../../config/sepay.config';
import { formatMoney, money } from '../../../common/utils/money';

const CODE_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
const CODE_SUFFIX_LENGTH = 10;

/** Một giao dịch ngân hàng đã chuẩn hóa, dù đến từ webhook hay API đối soát. */
export interface BankTransaction {
  providerEventId: string;
  transferType: string;
  amount: string;
  code: string | null;
  content: string | null;
  referenceCode: string | null;
  accountNumber: string | null;
  transactionDate: string | null;
  raw: Record<string, unknown>;
}

export interface DepositInstructions {
  bankCode: string;
  accountNumber: string;
  accountHolder: string;
  amount: string;
  transferContent: string;
  qrImageUrl: string;
}

interface SepayApiTransaction {
  id: string | number;
  account_number?: string | null;
  transaction_date?: string | null;
  amount_in?: string | null;
  amount_out?: string | null;
  transaction_content?: string | null;
  reference_number?: string | null;
  code?: string | null;
}

function asText(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value === 'string') return value.trim() || null;
  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }
  return null;
}

function sha256(value: string): Buffer {
  return createHash('sha256').update(value).digest();
}

/**
 * Bọc cấu hình và giao tiếp với SePay. Không đụng DB để dễ test riêng.
 * Tài liệu SePay: webhook gửi header `Authorization: Apikey <key>`.
 */
@Injectable()
export class SepayClientService {
  constructor(private readonly configService: ConfigService) {}

  get config(): SepayConfig {
    return this.configService.get<SepayConfig>('sepay')!;
  }

  isDepositConfigured(): boolean {
    const { bankCode, accountNumber, webhookApiKey } = this.config;
    return Boolean(bankCode && accountNumber && webhookApiKey);
  }

  assertDepositConfigured(): void {
    if (!this.isDepositConfigured()) {
      throw new ServiceUnavailableException({
        success: false,
        data: null,
        message: 'Nạp tiền qua ngân hàng chưa được cấu hình.',
        errorCode: 'PAYMENT_PROVIDER_NOT_CONFIGURED',
      });
    }
  }

  /** So sánh hằng thời gian để không lộ API key qua timing. */
  verifyWebhookAuthorization(header?: string): boolean {
    const expected = this.config.webhookApiKey;
    if (!expected || !header) return false;
    const match = /^Apikey\s+(.+)$/i.exec(header.trim());
    if (!match) return false;
    return timingSafeEqual(sha256(match[1].trim()), sha256(expected));
  }

  generatePaymentCode(): string {
    let suffix = '';
    for (let i = 0; i < CODE_SUFFIX_LENGTH; i++) {
      suffix += CODE_ALPHABET[randomInt(CODE_ALPHABET.length)];
    }
    return `${this.config.paymentPrefix}${suffix}`;
  }

  /**
   * Ưu tiên trường `code` SePay đã nhận diện; nếu trống thì tìm trong nội dung
   * chuyển khoản (ngân hàng có thể chèn thêm chữ trước/sau mã).
   */
  extractPaymentCode(
    code: string | null,
    content: string | null,
  ): string | null {
    const pattern = new RegExp(
      `${this.config.paymentPrefix}[A-Z0-9]{${CODE_SUFFIX_LENGTH}}`,
    );
    for (const candidate of [code, content]) {
      const found = candidate ? pattern.exec(candidate.toUpperCase()) : null;
      if (found) return found[0];
    }
    return null;
  }

  /** Có dấu hiệu là giao dịch nạp của shop (dùng để lọc khi sync). */
  looksLikeShopTransfer(code: string | null, content: string | null): boolean {
    const prefix = this.config.paymentPrefix;
    return [code, content].some((value) =>
      Boolean(value && value.toUpperCase().includes(prefix)),
    );
  }

  buildInstructions(code: string, amount: string): DepositInstructions {
    const { bankCode, accountNumber, accountHolder, qrBaseUrl } = this.config;
    const integerAmount = money(amount).toDecimalPlaces(0).toFixed(0);
    const query = new URLSearchParams({
      acc: accountNumber,
      bank: bankCode,
      amount: integerAmount,
      des: code,
      template: 'compact',
    });
    return {
      bankCode,
      accountNumber,
      accountHolder,
      amount: integerAmount,
      transferContent: code,
      qrImageUrl: `${qrBaseUrl}?${query.toString()}`,
    };
  }

  /** Payload webhook SePay: id, transferType, transferAmount, code, content... */
  normalizeWebhookPayload(body: Record<string, unknown>): BankTransaction {
    const id = asText(body?.id);
    const amountText = asText(body?.transferAmount);
    if (!id || !amountText || !/^\d+(\.\d+)?$/.test(amountText)) {
      throw new BadRequestException({
        success: false,
        data: null,
        message: 'Invalid SePay webhook payload.',
        errorCode: 'INVALID_WEBHOOK_PAYLOAD',
      });
    }
    return {
      providerEventId: id,
      transferType: (asText(body.transferType) || 'in').toLowerCase(),
      amount: formatMoney(amountText),
      code: asText(body.code),
      content: asText(body.content) ?? asText(body.description),
      referenceCode: asText(body.referenceCode),
      accountNumber: asText(body.accountNumber),
      transactionDate: asText(body.transactionDate),
      raw: body,
    };
  }

  normalizeApiTransaction(row: SepayApiTransaction): BankTransaction {
    const amountIn = money(row.amount_in || 0);
    const isIncoming = amountIn.gt(0);
    return {
      providerEventId: String(row.id),
      transferType: isIncoming ? 'in' : 'out',
      amount: formatMoney(isIncoming ? amountIn : money(row.amount_out || 0)),
      code: asText(row.code),
      content: asText(row.transaction_content),
      referenceCode: asText(row.reference_number),
      accountNumber: asText(row.account_number),
      transactionDate: asText(row.transaction_date),
      raw: row as unknown as Record<string, unknown>,
    };
  }

  /** Lấy giao dịch gần đây từ SePay API (dùng để bù webhook bị lỡ). */
  async fetchRecentTransactions(
    sinceHours: number,
  ): Promise<BankTransaction[]> {
    const { apiToken, apiBaseUrl, accountNumber } = this.config;
    if (!apiToken) {
      throw new ServiceUnavailableException({
        success: false,
        data: null,
        message: 'SEPAY_API_TOKEN chưa được cấu hình.',
        errorCode: 'PAYMENT_PROVIDER_NOT_CONFIGURED',
      });
    }
    const query = new URLSearchParams({
      limit: '500',
      transaction_date_min: this.vietnamTime(
        new Date(Date.now() - sinceHours * 3600_000),
      ),
    });
    if (accountNumber) query.set('account_number', accountNumber);

    const response = await fetch(
      `${apiBaseUrl}/userapi/transactions/list?${query.toString()}`,
      {
        headers: { Authorization: `Bearer ${apiToken}` },
        signal: AbortSignal.timeout(15_000),
      },
    );
    if (!response.ok) {
      throw new ServiceUnavailableException({
        success: false,
        data: null,
        message: `SePay API trả về HTTP ${response.status}.`,
        errorCode: 'PAYMENT_PROVIDER_UNAVAILABLE',
      });
    }
    const body = (await response.json()) as {
      transactions?: SepayApiTransaction[];
    };
    return (body.transactions || []).map((row) =>
      this.normalizeApiTransaction(row),
    );
  }

  /** SePay lọc theo giờ Việt Nam, định dạng `YYYY-MM-DD HH:mm:ss`. */
  private vietnamTime(date: Date): string {
    const shifted = new Date(date.getTime() + 7 * 3600_000);
    return shifted.toISOString().slice(0, 19).replace('T', ' ');
  }
}
