import { Client } from 'pg';

/**
 * Direct connection to the test database (credentials from .env.test).
 * Used only to (a) assert database state after a flow and (b) seed/clean
 * pricing fixtures that have no admin API. Every statement is scoped to rows
 * created by the suite - never truncate or touch foreign data.
 */
function requireEnv(key: string): string {
  const value = process.env[key];
  if (!value) {
    throw new Error(`Missing required env "${key}" (expected in .env.test)`);
  }
  return value;
}

export async function withDb<T>(fn: (client: Client) => Promise<T>): Promise<T> {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('Refusing to open a database connection in production.');
  }
  const client = new Client({
    host: requireEnv('DB_HOST'),
    port: Number(requireEnv('DB_PORT')),
    user: requireEnv('DB_USERNAME'),
    password: requireEnv('DB_PASSWORD'),
    database: requireEnv('DB_DATABASE'),
    ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false,
  });
  await client.connect();
  try {
    return await fn(client);
  } finally {
    await client.end();
  }
}

export async function dbQuery<T = any>(
  sql: string,
  params: unknown[] = [],
): Promise<T[]> {
  return withDb(async (client) => (await client.query(sql, params)).rows as T[]);
}

export async function setProductPricing(
  productId: string,
  basePrice: string | null,
  minimumSellingPrice: string | null = null,
): Promise<void> {
  await dbQuery(
    'UPDATE products SET base_price = $2, minimum_selling_price = $3 WHERE id = $1',
    [productId, basePrice, minimumSellingPrice],
  );
}

export async function insertPriceTier(tier: {
  productId: string;
  roleCode: string;
  quantityFrom: number;
  quantityTo?: number | null;
  unitPrice: string;
  seasonId?: string | null;
  isActive?: boolean;
}): Promise<string> {
  const rows = await dbQuery<{ id: string }>(
    `INSERT INTO price_tiers
       (product_id, season_id, role_code, quantity_from, quantity_to, unit_price, is_active)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING id`,
    [
      tier.productId,
      tier.seasonId ?? null,
      tier.roleCode,
      tier.quantityFrom,
      tier.quantityTo ?? null,
      tier.unitPrice,
      tier.isActive ?? true,
    ],
  );
  return rows[0].id;
}

export async function insertPriceRule(rule: {
  name: string;
  ruleType: string;
  discountType: 'PERCENTAGE' | 'FIXED_AMOUNT';
  discountValue: string;
  applicableRoles?: string[] | null;
  applicableProductIds?: string[] | null;
  applicableSeasonIds?: string[] | null;
  startDate?: string | null;
  endDate?: string | null;
  priority?: number;
  isActive?: boolean;
}): Promise<string> {
  const rows = await dbQuery<{ id: string }>(
    `INSERT INTO price_rules
       (name, rule_type, priority, discount_type, discount_value,
        applicable_roles, applicable_product_ids, applicable_season_ids,
        start_date, end_date, is_active)
     VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7::jsonb, $8::jsonb, $9, $10, $11)
     RETURNING id`,
    [
      rule.name,
      rule.ruleType,
      rule.priority ?? 0,
      rule.discountType,
      rule.discountValue,
      rule.applicableRoles ? JSON.stringify(rule.applicableRoles) : null,
      rule.applicableProductIds
        ? JSON.stringify(rule.applicableProductIds)
        : null,
      rule.applicableSeasonIds
        ? JSON.stringify(rule.applicableSeasonIds)
        : null,
      rule.startDate ?? null,
      rule.endDate ?? null,
      rule.isActive ?? true,
    ],
  );
  return rows[0].id;
}

export async function deletePricingFixtures(ids: {
  tierIds: string[];
  ruleIds: string[];
}): Promise<void> {
  if (ids.tierIds.length) {
    await dbQuery('DELETE FROM price_tiers WHERE id = ANY($1::uuid[])', [
      ids.tierIds,
    ]);
  }
  if (ids.ruleIds.length) {
    await dbQuery('DELETE FROM price_rules WHERE id = ANY($1::uuid[])', [
      ids.ruleIds,
    ]);
  }
}

export async function deleteCampaignParticipants(
  campaignIds: string[],
): Promise<void> {
  if (!campaignIds.length) return;
  await dbQuery(
    'DELETE FROM chung_suc_participants WHERE campaign_id = ANY($1::uuid[])',
    [campaignIds],
  );
}
