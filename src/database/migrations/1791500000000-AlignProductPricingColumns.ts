import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Product and PriceHistory entities declare columns that no applied migration
 * created, so every query selecting products failed with
 * "column product.base_price does not exist".
 */
export class AlignProductPricingColumns1791500000000 implements MigrationInterface {
  name = 'AlignProductPricingColumns1791500000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "products"
      ADD COLUMN IF NOT EXISTS "base_price" numeric(19,4)
    `);
    await queryRunner.query(`
      ALTER TABLE "products"
      ADD COLUMN IF NOT EXISTS "is_active" boolean NOT NULL DEFAULT true
    `);
    await queryRunner.query(`
      ALTER TABLE "price_history"
      ADD COLUMN IF NOT EXISTS "deleted_at" TIMESTAMP WITH TIME ZONE
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "price_history" DROP COLUMN IF EXISTS "deleted_at"`,
    );
    await queryRunner.query(
      `ALTER TABLE "products" DROP COLUMN IF EXISTS "is_active"`,
    );
    await queryRunner.query(
      `ALTER TABLE "products" DROP COLUMN IF EXISTS "base_price"`,
    );
  }
}
