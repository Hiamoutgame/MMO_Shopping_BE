import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Nạp ví qua SePay: thêm provider SEPAY, hạn lệnh nạp và bảng lưu từng giao
 * dịch ngân hàng SePay báo về (unique theo sepay_id để chống cộng trùng).
 */
export class AddSepayDeposits1791800000000 implements MigrationInterface {
  name = 'AddSepayDeposits1791800000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TYPE "public"."payment_transactions_provider_enum" ADD VALUE IF NOT EXISTS 'SEPAY'
    `);
    await queryRunner.query(`
      ALTER TABLE "payment_transactions" ADD COLUMN "expires_at" timestamptz
    `);

    await queryRunner.query(`
      CREATE TYPE "sepay_transaction_status_enum" AS ENUM (
        'MATCHED',
        'UNMATCHED',
        'RESOLVED',
        'IGNORED'
      )
    `);
    await queryRunner.query(`
      CREATE TABLE "sepay_transactions" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        "sepay_id" bigint NOT NULL,
        "gateway" varchar(100),
        "transaction_date" varchar(30),
        "account_number" varchar(50),
        "code" varchar(50),
        "content" text,
        "transfer_type" varchar(10) NOT NULL,
        "transfer_amount" numeric(19,4) NOT NULL,
        "reference_code" varchar(100),
        "source" varchar(20) NOT NULL,
        "status" "sepay_transaction_status_enum" NOT NULL,
        "note" text,
        "payment_transaction_id" uuid,
        "resolved_by" uuid,
        "resolved_at" timestamptz,
        "payload" jsonb NOT NULL,
        CONSTRAINT "pk_sepay_transactions" PRIMARY KEY ("id"),
        CONSTRAINT "uq_sepay_transactions_sepay_id" UNIQUE ("sepay_id"),
        CONSTRAINT "fk_sepay_transactions_payment" FOREIGN KEY ("payment_transaction_id")
          REFERENCES "payment_transactions" ("id") ON DELETE RESTRICT
      )
    `);
    await queryRunner.query(`
      CREATE INDEX "idx_sepay_transactions_status" ON "sepay_transactions" ("status")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "sepay_transactions"`);
    await queryRunner.query(`DROP TYPE "sepay_transaction_status_enum"`);
    await queryRunner.query(
      `ALTER TABLE "payment_transactions" DROP COLUMN "expires_at"`,
    );
    // Postgres không xoá được một giá trị khỏi enum; giữ 'SEPAY'.
  }
}
