/**
 * Một giao dịch ngân hàng SePay báo về, đã chuẩn hoá. Webhook và API
 * `transactions/list` có tên trường khác nhau nên đều quy về dạng này.
 */
export interface SepayIncomingTransaction {
  sepayId: string;
  gateway: string | null;
  transactionDate: string | null;
  accountNumber: string | null;
  subAccount: string | null;
  code: string | null;
  content: string | null;
  transferType: 'in' | 'out';
  transferAmount: number;
  referenceCode: string | null;
  raw: Record<string, unknown>;
}

function optionalText(value: unknown): string | null {
  if (typeof value !== 'string' && typeof value !== 'number') return null;
  const result = String(value).trim();
  return result ? result : null;
}

function positiveId(value: unknown): string | null {
  const id = typeof value === 'string' ? value.trim() : value;
  if (typeof id === 'number' && Number.isSafeInteger(id) && id > 0) {
    return String(id);
  }
  if (typeof id === 'string' && /^[1-9]\d{0,18}$/.test(id)) return id;
  return null;
}

function amount(value: unknown): number | null {
  const result = typeof value === 'string' ? Number(value) : value;
  return typeof result === 'number' && Number.isFinite(result) && result >= 0
    ? result
    : null;
}

/** Payload webhook SePay. Trả null nếu thiếu trường bắt buộc. */
export function parseSepayWebhook(
  body: unknown,
): SepayIncomingTransaction | null {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    return null;
  }
  const raw = body as Record<string, unknown>;
  const sepayId = positiveId(raw.id);
  const transferAmount = amount(raw.transferAmount);
  if (
    !sepayId ||
    transferAmount === null ||
    (raw.transferType !== 'in' && raw.transferType !== 'out')
  ) {
    return null;
  }
  return {
    sepayId,
    gateway: optionalText(raw.gateway),
    transactionDate: optionalText(raw.transactionDate),
    accountNumber: optionalText(raw.accountNumber),
    subAccount: optionalText(raw.subAccount),
    code: optionalText(raw.code),
    content: optionalText(raw.content),
    transferType: raw.transferType,
    transferAmount,
    referenceCode: optionalText(raw.referenceCode),
    raw,
  };
}

/** Một dòng của `GET /userapi/transactions/list`. */
export function parseSepayListItem(
  item: unknown,
): SepayIncomingTransaction | null {
  if (typeof item !== 'object' || item === null) return null;
  const raw = item as Record<string, unknown>;
  const sepayId = positiveId(raw.id);
  const amountIn = amount(raw.amount_in) ?? 0;
  const amountOut = amount(raw.amount_out) ?? 0;
  if (!sepayId) return null;
  return {
    sepayId,
    gateway: optionalText(raw.bank_brand_name),
    transactionDate: optionalText(raw.transaction_date),
    accountNumber: optionalText(raw.account_number),
    subAccount: optionalText(raw.sub_account),
    code: optionalText(raw.code),
    content: optionalText(raw.transaction_content),
    transferType: amountIn > 0 ? 'in' : 'out',
    transferAmount: amountIn > 0 ? amountIn : amountOut,
    referenceCode: optionalText(raw.reference_number),
    raw,
  };
}

/**
 * Tìm mã nạp (PREFIX + 8 ký tự) trong trường `code` SePay đã nhận diện, nếu
 * không có thì trong nội dung chuyển khoản. Ngân hàng hay chèn khoảng trắng
 * hoặc đổi chữ thường, nên so khớp không phân biệt hoa thường.
 */
export function extractPaymentCode(
  prefix: string,
  code: string | null,
  content: string | null,
): string | null {
  const pattern = new RegExp(`${prefix}[A-Z0-9]{8}`, 'i');
  for (const source of [code, content, content?.replace(/\s+/g, '')]) {
    const match = source?.match(pattern);
    if (match) return match[0].toUpperCase();
  }
  return null;
}
