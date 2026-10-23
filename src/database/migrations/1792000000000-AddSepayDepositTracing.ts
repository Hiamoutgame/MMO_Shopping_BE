import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Nạp tiền qua SePay (chuyển khoản ngân hàng + webhook).
 *
 * - payment_webhook_events: nhật ký từng giao dịch ngân hàng báo về, UNIQUE theo
 *   (provider, provider_event_id) để retry/sync không cộng tiền hai lần.
 * - payment_transactions.expires_at: hạn hiển thị QR (chuyển muộn vẫn được ghi nhận).
 * - wallet_transactions.ledger_seq: thứ tự ghi tuyệt đối để đối soát chuỗi số dư
 *   (created_at trùng nhau khi nhiều dòng ghi trong cùng một DB transaction).
 * - wallet_transactions: CHECK toán học số dư và trigger chặn UPDATE/DELETE để
 *   ledger chỉ được ghi thêm. CHECK dùng NOT VALID để không chặn dữ liệu cũ;
 *   kiểm tra dữ liệu cũ bằng API đối soát.
 */
export class AddSepayDepositTracing1792000000000 implements MigrationInterface {
  name = 'AddSepayDepositTracing1792000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TYPE "public"."payment_transactions_provider_enum" ADD VALUE IF NOT EXISTS 'SEPAY'
    `);
    await queryRunner.query(`
      ALTER TABLE "payment_transactions" ADD COLUMN "expires_at" timestamptz
    `);
    await queryRunner.query(`
      CREATE INDEX "idx_payment_transactions_account_status"
      ON "payment_transactions" ("account_id", "status")
    `);

    await queryRunner.query(`
      CREATE TYPE "public"."payment_webhook_events_provider_enum"
      AS ENUM('VNPAY', 'MOMO', 'ZALOPAY', 'BANK_TRANSFER', 'SEPAY')
    `);
    await queryRunner.query(`
      CREATE TYPE "public"."payment_webhook_events_status_enum"
      AS ENUM('RECEIVED', 'PROCESSED', 'IGNORED', 'NEEDS_REVIEW', 'RESOLVED')
    `);
    await queryRunner.query(`
      CREATE TABLE "payment_webhook_events" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        "provider" "public"."payment_webhook_events_provider_enum" NOT NULL,
        "provider_event_id" varchar(100) NOT NULL,
        "source" varchar(20) NOT NULL,
        "status" "public"."payment_webhook_events_status_enum" NOT NULL DEFAULT 'RECEIVED',
        "transfer_type" varchar(10) NOT NULL,
        "amount" numeric(19,4) NOT NULL,
        "payment_code" varchar(50),
        "content" text,
        "reference_code" varchar(100),
        "account_number" varchar(50),
        "transaction_date" varchar(40),
        "raw_payload" jsonb NOT NULL,
        "reason" varchar(60),
        "note" text,
        "delivery_count" int NOT NULL DEFAULT 1,
        "payment_transaction_id" uuid,
        "wallet_transaction_id" uuid,
        "resolved_by" uuid,
        "processed_at" timestamptz,
        "last_received_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "PK_payment_webhook_events" PRIMARY KEY ("id"),
        CONSTRAINT "uq_payment_webhook_events_provider_event" UNIQUE ("provider", "provider_event_id"),
        CONSTRAINT "FK_payment_webhook_events_payment" FOREIGN KEY ("payment_transaction_id")
          REFERENCES "payment_transactions"("id"),
        CONSTRAINT "FK_payment_webhook_events_wallet_tx" FOREIGN KEY ("wallet_transaction_id")
          REFERENCES "wallet_transactions"("id")
      )
    `);
    await queryRunner.query(`
      CREATE INDEX "idx_payment_webhook_events_status" ON "payment_webhook_events" ("status")
    `);

    await queryRunner.query(`
      ALTER TABLE "wallet_transactions"
      ADD COLUMN "ledger_seq" bigint GENERATED ALWAYS AS IDENTITY
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX "uq_wallet_transactions_wallet_seq"
      ON "wallet_transactions" ("wallet_id", "ledger_seq")
    `);
    await queryRunner.query(`
      ALTER TABLE "wallet_transactions"
      ADD CONSTRAINT "chk_wallet_transactions_balance_math" CHECK (
        (type = 'CREDIT' AND balance_after = balance_before + amount)
        OR (type = 'DEBIT' AND balance_after = balance_before - amount)
      ) NOT VALID
    `);
    await queryRunner.query(`
      CREATE OR REPLACE FUNCTION "wallet_transactions_append_only"() RETURNS trigger AS $$
      BEGIN
        RAISE EXCEPTION 'wallet_transactions is append-only (% blocked)', TG_OP;
      END;
      $$ LANGUAGE plpgsql
    `);
    await queryRunner.query(`
      CREATE TRIGGER "trg_wallet_transactions_append_only"
      BEFORE UPDATE OR DELETE ON "wallet_transactions"
      FOR EACH ROW EXECUTE FUNCTION "wallet_transactions_append_only"()
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP TRIGGER IF EXISTS "trg_wallet_transactions_append_only" ON "wallet_transactions"`,
    );
    await queryRunner.query(
      `DROP FUNCTION IF EXISTS "wallet_transactions_append_only"()`,
    );
    await queryRunner.query(
      `ALTER TABLE "wallet_transactions" DROP CONSTRAINT "chk_wallet_transactions_balance_math"`,
    );
    await queryRunner.query(`DROP INDEX "uq_wallet_transactions_wallet_seq"`);
    await queryRunner.query(
      `ALTER TABLE "wallet_transactions" DROP COLUMN "ledger_seq"`,
    );
    await queryRunner.query(`DROP TABLE "payment_webhook_events"`);
    await queryRunner.query(
      `DROP TYPE "public"."payment_webhook_events_status_enum"`,
    );
    await queryRunner.query(
      `DROP TYPE "public"."payment_webhook_events_provider_enum"`,
    );
    await queryRunner.query(
      `DROP INDEX "idx_payment_transactions_account_status"`,
    );
    await queryRunner.query(
      `ALTER TABLE "payment_transactions" DROP COLUMN "expires_at"`,
    );
    // Postgres không hỗ trợ xóa giá trị enum; 'SEPAY' được giữ lại.
  }
}
