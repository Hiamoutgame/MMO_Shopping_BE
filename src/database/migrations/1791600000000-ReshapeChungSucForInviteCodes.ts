import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Chung sức đổi từ "mua chung" sang "tiếp sức mã mời": mỗi participant là một
 * yêu cầu của khách cho một mã mời, mã lưu dạng hash + mã hóa, có trạng thái
 * và giá chụp lúc tạo. Campaign không còn cộng dồn số lượng.
 *
 * Các cột NOT NULL mới cố ý không có DEFAULT: migration dừng nếu
 * chung_suc_participants đã có dữ liệu.
 */
export class ReshapeChungSucForInviteCodes1791600000000 implements MigrationInterface {
  name = 'ReshapeChungSucForInviteCodes1791600000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TYPE "chung_suc_participant_status_enum" AS ENUM (
        'PENDING',
        'CHECKING',
        'PROCESSING',
        'SUCCESS',
        'PARTIAL_SUCCESS',
        'FAILED',
        'CANCELLED'
      )
    `);

    await queryRunner.query(`
      ALTER TABLE "chung_suc_participants"
        DROP COLUMN "invite_code",
        ADD COLUMN "code_hash" varchar(64) NOT NULL,
        ADD COLUMN "encrypted_code" text NOT NULL,
        ADD COLUMN "status" "chung_suc_participant_status_enum" NOT NULL DEFAULT 'PENDING',
        ADD COLUMN "unit_price" numeric(19,4) NOT NULL,
        ADD COLUMN "currency" char(3) NOT NULL DEFAULT 'VND',
        ADD COLUMN "cancelled_at" timestamptz
    `);

    await queryRunner.query(`
      CREATE UNIQUE INDEX "uq_chung_suc_participants_open_code"
      ON "chung_suc_participants" ("campaign_id", "code_hash")
      WHERE status IN ('PENDING', 'CHECKING', 'PROCESSING')
    `);
    await queryRunner.query(`
      CREATE INDEX "idx_chung_suc_participants_status"
      ON "chung_suc_participants" ("status")
    `);

    await queryRunner.query(`
      ALTER TABLE "chung_suc_campaigns" DROP COLUMN "current_quantity"
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "chung_suc_campaigns"
      ADD COLUMN "current_quantity" int NOT NULL DEFAULT 0
    `);

    await queryRunner.query(`DROP INDEX "idx_chung_suc_participants_status"`);
    await queryRunner.query(`DROP INDEX "uq_chung_suc_participants_open_code"`);

    await queryRunner.query(`
      ALTER TABLE "chung_suc_participants"
        DROP COLUMN "cancelled_at",
        DROP COLUMN "currency",
        DROP COLUMN "unit_price",
        DROP COLUMN "status",
        DROP COLUMN "encrypted_code",
        DROP COLUMN "code_hash",
        ADD COLUMN "invite_code" varchar(100)
    `);

    await queryRunner.query(`DROP TYPE "chung_suc_participant_status_enum"`);
  }
}
