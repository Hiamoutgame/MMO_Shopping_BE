import { MigrationInterface, QueryRunner } from 'typeorm';

export class ImplementPurchaseFlows1787639706842 implements MigrationInterface {
  name = 'ImplementPurchaseFlows1787639706842';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "inventory_items"
      ADD COLUMN "encryption_key_version" integer NOT NULL DEFAULT 1
    `);
    await queryRunner.query(`
      ALTER TABLE "inventory_items"
      ADD COLUMN "metadata" jsonb
    `);
    await queryRunner.query(`
      ALTER TABLE "product_views"
      ADD COLUMN "source" character varying(50)
    `);
    await queryRunner.query(`
      ALTER TABLE "payment_transactions"
      ALTER COLUMN "provider_transaction_id" DROP NOT NULL
    `);
    await queryRunner.query(`
      ALTER TABLE "payment_transactions"
      ADD COLUMN "merchant_reference" character varying(100)
    `);
    await queryRunner.query(`
      UPDATE "payment_transactions"
      SET "merchant_reference" = COALESCE("provider_transaction_id", "id"::text)
    `);
    await queryRunner.query(`
      ALTER TABLE "payment_transactions"
      ALTER COLUMN "merchant_reference" SET NOT NULL
    `);
    await queryRunner.query(`
      ALTER TABLE "payment_transactions"
      ADD CONSTRAINT "UQ_payment_transactions_merchant_reference" UNIQUE ("merchant_reference")
    `);
    await queryRunner.query(`
      ALTER TABLE "wallet_transactions"
      ADD COLUMN "purpose" character varying(80) NOT NULL DEFAULT 'GENERAL'
    `);
    await queryRunner.query(`
      ALTER TYPE "public"."orders_status_enum"
      ADD VALUE IF NOT EXISTS 'PARTIALLY_REFUNDED'
    `);
    await queryRunner.query(`
      ALTER TABLE "orders"
      ADD COLUMN "refunded_amount" numeric(19, 4) NOT NULL DEFAULT '0'
    `);
    await queryRunner.query(`
      ALTER TABLE "orders"
      ADD COLUMN "idempotency_key" character varying(100)
    `);
    await queryRunner.query(`
      ALTER TABLE "orders"
      ADD CONSTRAINT "UQ_orders_idempotency_key" UNIQUE ("idempotency_key")
    `);
    await queryRunner.query(`
      ALTER TABLE "vouchers"
      ADD CONSTRAINT "chk_vouchers_percentage_value"
      CHECK (discount_type <> 'PERCENTAGE' OR discount_value <= 100)
    `);
    await queryRunner.query(`
      CREATE TABLE "idempotency_records" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "scope" character varying(80) NOT NULL,
        "key" character varying(120) NOT NULL,
        "account_id" uuid,
        "request_hash" character varying(64) NOT NULL,
        "status" character varying(20) NOT NULL DEFAULT 'PROCESSING',
        "response_body" jsonb,
        "locked_at" TIMESTAMP WITH TIME ZONE,
        CONSTRAINT "uq_idempotency_records_scope_key" UNIQUE ("scope", "key"),
        CONSTRAINT "PK_idempotency_records" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(`
      CREATE INDEX "idx_idempotency_records_account_id"
      ON "idempotency_records" ("account_id")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP INDEX "public"."idx_idempotency_records_account_id"
    `);
    await queryRunner.query(`
      DROP TABLE "idempotency_records"
    `);
    await queryRunner.query(`
      ALTER TABLE "vouchers" DROP CONSTRAINT "chk_vouchers_percentage_value"
    `);
    await queryRunner.query(`
      ALTER TABLE "orders" DROP CONSTRAINT "UQ_orders_idempotency_key"
    `);
    await queryRunner.query(`
      ALTER TABLE "orders" DROP COLUMN "idempotency_key"
    `);
    await queryRunner.query(`
      ALTER TABLE "orders" DROP COLUMN "refunded_amount"
    `);
    await queryRunner.query(`
      ALTER TABLE "wallet_transactions" DROP COLUMN "purpose"
    `);
    await queryRunner.query(`
      ALTER TABLE "payment_transactions" DROP CONSTRAINT "UQ_payment_transactions_merchant_reference"
    `);
    await queryRunner.query(`
      ALTER TABLE "payment_transactions" DROP COLUMN "merchant_reference"
    `);
    await queryRunner.query(`
      ALTER TABLE "payment_transactions"
      ALTER COLUMN "provider_transaction_id" SET NOT NULL
    `);
    await queryRunner.query(`
      ALTER TABLE "product_views" DROP COLUMN "source"
    `);
    await queryRunner.query(`
      ALTER TABLE "inventory_items" DROP COLUMN "metadata"
    `);
    await queryRunner.query(`
      ALTER TABLE "inventory_items" DROP COLUMN "encryption_key_version"
    `);
  }
}
