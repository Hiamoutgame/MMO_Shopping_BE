import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddSystemQueryIndexes1787639706844 implements MigrationInterface {
  name = 'AddSystemQueryIndexes1787639706844';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE INDEX "idx_orders_placed_at"
      ON "orders" ("placed_at")
    `);
    await queryRunner.query(`
      CREATE INDEX "idx_accounts_created_at"
      ON "accounts" ("created_at")
    `);
    await queryRunner.query(`
      CREATE INDEX "idx_product_views_viewed_at"
      ON "product_views" ("viewed_at")
    `);
    await queryRunner.query(`
      CREATE INDEX "idx_support_code_requests_submitted_at"
      ON "support_code_requests" ("submitted_at")
    `);
    await queryRunner.query(`
      CREATE INDEX "idx_admin_audit_logs_created_at"
      ON "admin_audit_logs" ("created_at")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP INDEX "public"."idx_admin_audit_logs_created_at"
    `);
    await queryRunner.query(`
      DROP INDEX "public"."idx_support_code_requests_submitted_at"
    `);
    await queryRunner.query(`
      DROP INDEX "public"."idx_product_views_viewed_at"
    `);
    await queryRunner.query(`
      DROP INDEX "public"."idx_accounts_created_at"
    `);
    await queryRunner.query(`
      DROP INDEX "public"."idx_orders_placed_at"
    `);
  }
}
