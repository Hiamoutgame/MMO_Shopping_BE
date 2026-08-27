/**
 * Chuyển một giá trị thành chuỗi canonical theo thứ tự key ổn định (sắp xếp
 * key alphabet) để hai object tương đương về nội dung luôn sinh ra cùng chuỗi,
 * bất kể thứ tự khai báo key. Dùng cho hash idempotency và so sánh outbox event.
 * Stateless/pure helper — không phụ thuộc trạng thái hệ thống.
 */
export function stableStringify(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(',')}]`;
  }
  if (value !== null && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    const entries = Object.keys(record)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableStringify(record[key])}`);
    return `{${entries.join(',')}}`;
  }
  return JSON.stringify(value);
}
