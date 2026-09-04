const MONEY_KEYS =
  /(?:^|_)(?:amount|balance|fee|commission|earned|price|spend)(?:_|$)/i;
const ID_KEYS = /(?:^id$|_id$)/i;

function camelCase(key: string): string {
  return key.replace(/_([a-z])/g, (_, letter: string) => letter.toUpperCase());
}

function normalizeScalar(key: string, value: unknown): unknown {
  if (typeof value === 'number' && MONEY_KEYS.test(key)) return String(value);
  if (typeof value === 'number' && ID_KEYS.test(key)) return String(value);
  return value;
}

export function normalizeProviderData(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(normalizeProviderData);
  if (!value || typeof value !== 'object') return value;

  const source = value as Record<string, unknown>;
  const normalized: Record<string, unknown> = {};
  for (const [key, raw] of Object.entries(source)) {
    const mappedKey = camelCase(key);
    const scalar = normalizeScalar(key, raw);
    normalized[mappedKey] =
      scalar && typeof scalar === 'object'
        ? normalizeProviderData(scalar)
        : scalar;
  }

  const pagination = normalized.pagination;
  if (
    Array.isArray(normalized.items) &&
    pagination &&
    typeof pagination === 'object'
  ) {
    const pageInfo = pagination as Record<string, unknown>;
    const page = Number(pageInfo.currentPage ?? pageInfo.page ?? 1);
    const rawPageSize =
      pageInfo.perPage ?? pageInfo.pageSize ?? normalized.items.length;
    const pageSize = Number(rawPageSize || 20);
    const total = Number(pageInfo.total ?? normalized.items.length);
    const totalPages = Number(
      pageInfo.lastPage ??
        pageInfo.totalPages ??
        (pageSize ? Math.ceil(total / pageSize) : 0),
    );
    delete normalized.pagination;
    normalized.total = total;
    normalized.page = page;
    normalized.pageSize = pageSize;
    normalized.totalPages = totalPages;
  }

  return normalized;
}

export function compactQuery(
  query: Record<string, unknown>,
): Record<string, string | number> {
  const output: Record<string, string | number> = {};
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === null || value === '') continue;
    output[key === 'perPage' ? 'per_page' : key] = value as string | number;
  }
  return output;
}
