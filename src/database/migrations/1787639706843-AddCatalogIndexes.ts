import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddCatalogIndexes1787639706843 implements MigrationInterface {
  name = 'AddCatalogIndexes1787639706843';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE INDEX "idx_product_categories_category_id"
      ON "product_categories" ("category_id")
    `);
    await queryRunner.query(`
      CREATE INDEX "idx_inventory_items_variant_status"
      ON "inventory_items" ("product_variant_id", "status")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP INDEX "public"."idx_inventory_items_variant_status"
    `);
    await queryRunner.query(`
      DROP INDEX "public"."idx_product_categories_category_id"
    `);
  }
}
