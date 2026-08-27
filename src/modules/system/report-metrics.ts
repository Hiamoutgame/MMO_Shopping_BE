import { subtractMoney } from '../../common/utils/money';

/**
 * Điền đủ mọi enum status với giá trị 0 nếu chưa có dữ liệu.
 * Pure — dùng cho breakdown theo status của order/inventory/support-code.
 */
export function zeroFill(
  values: readonly string[],
  map: Map<string, number>,
): Record<string, number> {
  const result: Record<string, number> = {};
  for (const value of values) {
    result[value] = map.get(value) || 0;
  }
  return result;
}

/**
 * net = gross - refunded. Tiền luôn là decimal string (VND).
 * Pure — dùng chung cho report và dashboard để tránh hai nguồn số liệu khác nhau.
 */
export function computeNetRevenue(gross: string, refunded: string): string {
  return subtractMoney(gross, refunded);
}
