import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Cấu hình động cho từng mùa sự kiện: biến thể, mã sự kiện và các giới hạn
 * lượt. Campaign cũ thành CUSTOM, không giới hạn, không reset theo ngày.
 */
export class AddChungSucEventRules1791700000000 implements MigrationInterface {
  name = 'AddChungSucEventRules1791700000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TYPE "chung_suc_event_variant_enum" AS ENUM (
        'XAP_XINH',
        'DOT_PHAO',
        'TINH_HOA',
        'BAN_BI',
        'CUSTOM'
      )
    `);

    await queryRunner.query(`
      ALTER TABLE "chung_suc_campaigns"
        ADD COLUMN "event_code" varchar(64),
        ADD COLUMN "variant" "chung_suc_event_variant_enum" NOT NULL DEFAULT 'CUSTOM',
        ADD COLUMN "helper_limit_per_day" int,
        ADD COLUMN "helper_limit_total" int,
        ADD COLUMN "owner_limit_per_day" int,
        ADD COLUMN "owner_limit_total" int,
        ADD COLUMN "points_cap" int,
        ADD COLUMN "daily_reset" boolean NOT NULL DEFAULT false,
        ADD CONSTRAINT "uq_chung_suc_campaigns_event_code" UNIQUE ("event_code"),
        ADD CONSTRAINT "chk_chung_suc_campaigns_limits_positive" CHECK (
          coalesce("helper_limit_per_day", 1) > 0
          AND coalesce("helper_limit_total", 1) > 0
          AND coalesce("owner_limit_per_day", 1) > 0
          AND coalesce("owner_limit_total", 1) > 0
          AND coalesce("points_cap", 1) > 0
        )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "chung_suc_campaigns"
        DROP CONSTRAINT "chk_chung_suc_campaigns_limits_positive",
        DROP CONSTRAINT "uq_chung_suc_campaigns_event_code",
        DROP COLUMN "daily_reset",
        DROP COLUMN "points_cap",
        DROP COLUMN "owner_limit_total",
        DROP COLUMN "owner_limit_per_day",
        DROP COLUMN "helper_limit_total",
        DROP COLUMN "helper_limit_per_day",
        DROP COLUMN "variant",
        DROP COLUMN "event_code"
    `);

    await queryRunner.query(`DROP TYPE "chung_suc_event_variant_enum"`);
  }
}
