import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddChungSucSystem1788600000000 implements MigrationInterface {
  name = 'AddChungSucSystem1788600000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // ============================================
    // 1. CREATE ENUMS
    // ============================================
    await queryRunner.query(`
      CREATE TYPE "season_status_enum" AS ENUM (
        'DRAFT',
        'UPCOMING',
        'ACTIVE',
        'PAUSED',
        'ENDED',
        'ARCHIVED'
      );
    `);

    await queryRunner.query(`
      CREATE TYPE "campaign_status_enum" AS ENUM (
        'DRAFT',
        'UPCOMING',
        'ACTIVE',
        'PAUSED',
        'COMPLETED',
        'ENDED',
        'CLOSED'
      );
    `);

    await queryRunner.query(`
      CREATE TYPE "price_rule_type_enum" AS ENUM (
        'BASE',
        'ROLE_BASED',
        'SEASONAL',
        'QUANTITY',
        'PACKAGE',
        'PROMOTION'
      );
    `);

    await queryRunner.query(`
      CREATE TYPE "discount_type_enum" AS ENUM (
        'PERCENTAGE',
        'FIXED_AMOUNT'
      );
    `);

    await queryRunner.query(`
      CREATE TYPE "seller_approval_status_enum" AS ENUM (
        'PENDING',
        'APPROVED',
        'REJECTED',
        'SUSPENDED'
      );
    `);

    await queryRunner.query(`
      CREATE TYPE "test_campaign_status_enum" AS ENUM (
        'TESTING',
        'SUCCESS',
        'FAILED',
        'CONTINUE',
        'SCALE'
      );
    `);

    // ============================================
    // 2. SEASONS TABLE
    // ============================================
    await queryRunner.query(`
      CREATE TABLE "seasons" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "name" varchar(255) NOT NULL,
        "slug" varchar(255) NOT NULL,
        "description" text,
        "banner_url" varchar(500),
        "start_date" timestamptz NOT NULL,
        "end_date" timestamptz NOT NULL,
        "status" "season_status_enum" NOT NULL DEFAULT 'DRAFT',
        "metadata" jsonb,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        "deleted_at" timestamptz,
        CONSTRAINT "PK_seasons" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_seasons_slug" UNIQUE ("slug")
      );
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_seasons_status" ON "seasons" ("status");
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_seasons_dates" ON "seasons" ("start_date", "end_date");
    `);

    // ============================================
    // 3. CHUNG SUC CAMPAIGNS TABLE
    // ============================================
    await queryRunner.query(`
      CREATE TABLE "chung_suc_campaigns" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "season_id" uuid,
        "product_id" uuid NOT NULL,
        "name" varchar(255) NOT NULL,
        "slug" varchar(255) NOT NULL,
        "description" text,
        "image_url" varchar(500),
        "target_quantity" int NOT NULL,
        "current_quantity" int NOT NULL DEFAULT 0,
        "start_time" timestamptz NOT NULL,
        "end_time" timestamptz NOT NULL,
        "status" "campaign_status_enum" NOT NULL DEFAULT 'DRAFT',
        "completion_conditions" jsonb,
        "rewards" jsonb,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        "deleted_at" timestamptz,
        CONSTRAINT "PK_chung_suc_campaigns" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_chung_suc_campaigns_slug" UNIQUE ("slug")
      );
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_chung_suc_campaigns_season" ON "chung_suc_campaigns" ("season_id");
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_chung_suc_campaigns_product" ON "chung_suc_campaigns" ("product_id");
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_chung_suc_campaigns_status" ON "chung_suc_campaigns" ("status");
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_chung_suc_campaigns_dates" ON "chung_suc_campaigns" ("start_time", "end_time");
    `);

    // ============================================
    // 4. CHUNG SUC PARTICIPANTS TABLE
    // ============================================
    await queryRunner.query(`
      CREATE TABLE "chung_suc_participants" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "campaign_id" uuid NOT NULL,
        "account_id" uuid NOT NULL,
        "order_id" uuid,
        "invite_code" varchar(100),
        "quantity" int NOT NULL,
        "joined_at" timestamptz NOT NULL DEFAULT now(),
        "metadata" jsonb,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "PK_chung_suc_participants" PRIMARY KEY ("id")
      );
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_chung_suc_participants_campaign_account"
      ON "chung_suc_participants" ("campaign_id", "account_id");
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_chung_suc_participants_campaign_joined"
      ON "chung_suc_participants" ("campaign_id", "joined_at");
    `);

    // ============================================
    // 5. PRICE RULES TABLE
    // ============================================
    await queryRunner.query(`
      CREATE TABLE "price_rules" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "name" varchar(255) NOT NULL,
        "description" text,
        "rule_type" "price_rule_type_enum" NOT NULL,
        "priority" int NOT NULL DEFAULT 0,
        "is_stackable" boolean NOT NULL DEFAULT false,
        "discount_type" "discount_type_enum" NOT NULL,
        "discount_value" numeric(19,4) NOT NULL,
        "applicable_roles" jsonb,
        "applicable_product_ids" jsonb,
        "applicable_season_ids" jsonb,
        "applicable_package_ids" jsonb,
        "minimum_quantity" int,
        "maximum_quantity" int,
        "start_date" timestamptz,
        "end_date" timestamptz,
        "is_active" boolean NOT NULL DEFAULT true,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        "deleted_at" timestamptz,
        CONSTRAINT "PK_price_rules" PRIMARY KEY ("id")
      );
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_price_rules_active_priority"
      ON "price_rules" ("is_active", "priority");
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_price_rules_type_active"
      ON "price_rules" ("rule_type", "is_active");
    `);

    // ============================================
    // 6. PRICE TIERS TABLE
    // ============================================
    await queryRunner.query(`
      CREATE TABLE "price_tiers" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "product_id" uuid NOT NULL,
        "season_id" uuid,
        "role_code" varchar(50) NOT NULL,
        "quantity_from" int NOT NULL,
        "quantity_to" int,
        "unit_price" numeric(19,4) NOT NULL,
        "is_active" boolean NOT NULL DEFAULT true,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        "deleted_at" timestamptz,
        CONSTRAINT "PK_price_tiers" PRIMARY KEY ("id")
      );
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_price_tiers_product_role_active"
      ON "price_tiers" ("product_id", "role_code", "is_active");
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_price_tiers_product_season_role"
      ON "price_tiers" ("product_id", "season_id", "role_code");
    `);

    // ============================================
    // 7. PACKAGES TABLE
    // ============================================
    await queryRunner.query(`
      CREATE TABLE "packages" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "season_id" uuid,
        "name" varchar(255) NOT NULL,
        "slug" varchar(255) NOT NULL,
        "description" text,
        "quantity" int NOT NULL,
        "display_price" numeric(19,4) NOT NULL,
        "unit_price" numeric(19,4) NOT NULL,
        "applicable_roles" jsonb NOT NULL,
        "sort_order" int NOT NULL DEFAULT 0,
        "is_active" boolean NOT NULL DEFAULT true,
        "start_date" timestamptz,
        "end_date" timestamptz,
        "metadata" jsonb,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        "deleted_at" timestamptz,
        CONSTRAINT "PK_packages" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_packages_slug" UNIQUE ("slug")
      );
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_packages_season_active"
      ON "packages" ("season_id", "is_active");
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_packages_active_sort"
      ON "packages" ("is_active", "sort_order");
    `);

    // ============================================
    // 8. PACKAGE PRODUCTS TABLE
    // ============================================
    await queryRunner.query(`
      CREATE TABLE "package_products" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "package_id" uuid NOT NULL,
        "product_id" uuid NOT NULL,
        "quantity" int NOT NULL,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "PK_package_products" PRIMARY KEY ("id")
      );
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_package_products_package"
      ON "package_products" ("package_id");
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_package_products_product"
      ON "package_products" ("product_id");
    `);

    // ============================================
    // 9. SELLER PROFILES TABLE
    // ============================================
    await queryRunner.query(`
      CREATE TABLE "seller_profiles" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "account_id" uuid NOT NULL,
        "business_name" varchar(255),
        "business_type" varchar(100),
        "tax_id" varchar(50),
        "approval_status" "seller_approval_status_enum" NOT NULL DEFAULT 'PENDING',
        "approved_at" timestamptz,
        "approved_by" uuid,
        "commission_rate" numeric(5,2),
        "metadata" jsonb,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        "deleted_at" timestamptz,
        CONSTRAINT "PK_seller_profiles" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_seller_profiles_account" UNIQUE ("account_id")
      );
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_seller_profiles_account"
      ON "seller_profiles" ("account_id");
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_seller_profiles_approval"
      ON "seller_profiles" ("approval_status");
    `);

    // ============================================
    // 10. SELLER REFERRAL CODES TABLE
    // ============================================
    await queryRunner.query(`
      CREATE TABLE "seller_referral_codes" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "seller_id" uuid NOT NULL,
        "code" varchar(100) NOT NULL,
        "is_active" boolean NOT NULL DEFAULT true,
        "usage_count" int NOT NULL DEFAULT 0,
        "metadata" jsonb,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        "deleted_at" timestamptz,
        CONSTRAINT "PK_seller_referral_codes" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_seller_referral_codes_code" UNIQUE ("code")
      );
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_seller_referral_codes_seller_active"
      ON "seller_referral_codes" ("seller_id", "is_active");
    `);

    // ============================================
    // 11. REFERRAL CLICKS TABLE
    // ============================================
    await queryRunner.query(`
      CREATE TABLE "referral_clicks" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "referral_code_id" uuid NOT NULL,
        "session_id" varchar(255) NOT NULL,
        "ip_address" varchar(45),
        "user_agent" text,
        "referrer" varchar(500),
        "clicked_at" timestamptz NOT NULL DEFAULT now(),
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "PK_referral_clicks" PRIMARY KEY ("id")
      );
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_referral_clicks_code_date"
      ON "referral_clicks" ("referral_code_id", "clicked_at");
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_referral_clicks_session"
      ON "referral_clicks" ("session_id");
    `);

    // ============================================
    // 12. PURCHASE BATCHES TABLE
    // ============================================
    await queryRunner.query(`
      CREATE TABLE "purchase_batches" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "product_id" uuid NOT NULL,
        "season_id" uuid,
        "batch_number" varchar(100) NOT NULL,
        "quantity" int NOT NULL,
        "cost_per_unit" numeric(19,4) NOT NULL,
        "total_cost" numeric(19,4) NOT NULL,
        "supplier" varchar(255),
        "purchase_date" date NOT NULL,
        "notes" text,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        "deleted_at" timestamptz,
        CONSTRAINT "PK_purchase_batches" PRIMARY KEY ("id")
      );
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_purchase_batches_product_date"
      ON "purchase_batches" ("product_id", "purchase_date");
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_purchase_batches_season"
      ON "purchase_batches" ("season_id");
    `);

    // ============================================
    // 13. COST TIERS TABLE
    // ============================================
    await queryRunner.query(`
      CREATE TABLE "cost_tiers" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "product_id" uuid NOT NULL,
        "quantity_from" int NOT NULL,
        "quantity_to" int,
        "cost_per_unit" numeric(19,4) NOT NULL,
        "is_active" boolean NOT NULL DEFAULT true,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        "deleted_at" timestamptz,
        CONSTRAINT "PK_cost_tiers" PRIMARY KEY ("id")
      );
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_cost_tiers_product_active"
      ON "cost_tiers" ("product_id", "is_active");
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_cost_tiers_product_quantity"
      ON "cost_tiers" ("product_id", "quantity_from");
    `);

    // ============================================
    // 14. PROFIT RECORDS TABLE
    // ============================================
    await queryRunner.query(`
      CREATE TABLE "profit_records" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "order_id" uuid NOT NULL,
        "product_id" uuid NOT NULL,
        "season_id" uuid,
        "seller_id" uuid,
        "quantity" int NOT NULL,
        "revenue" numeric(19,4) NOT NULL,
        "cost" numeric(19,4) NOT NULL,
        "profit" numeric(19,4) NOT NULL,
        "profit_margin" numeric(5,2) NOT NULL,
        "recorded_at" timestamptz NOT NULL DEFAULT now(),
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "PK_profit_records" PRIMARY KEY ("id")
      );
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_profit_records_order"
      ON "profit_records" ("order_id");
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_profit_records_product_date"
      ON "profit_records" ("product_id", "recorded_at");
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_profit_records_season_date"
      ON "profit_records" ("season_id", "recorded_at");
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_profit_records_seller_date"
      ON "profit_records" ("seller_id", "recorded_at");
    `);

    // ============================================
    // 15. PRODUCT TEST CAMPAIGNS TABLE
    // ============================================
    await queryRunner.query(`
      CREATE TABLE "product_test_campaigns" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "product_id" uuid NOT NULL,
        "season_id" uuid,
        "name" varchar(255) NOT NULL,
        "test_budget" numeric(19,4) NOT NULL,
        "test_quantity" int NOT NULL,
        "cost_per_unit" numeric(19,4) NOT NULL,
        "sold_quantity" int NOT NULL DEFAULT 0,
        "revenue" numeric(19,4) NOT NULL DEFAULT 0,
        "profit" numeric(19,4) NOT NULL DEFAULT 0,
        "status" "test_campaign_status_enum" NOT NULL DEFAULT 'TESTING',
        "start_date" date NOT NULL,
        "end_date" date,
        "conclusions" text,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        "deleted_at" timestamptz,
        CONSTRAINT "PK_product_test_campaigns" PRIMARY KEY ("id")
      );
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_product_test_campaigns_product_status"
      ON "product_test_campaigns" ("product_id", "status");
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_product_test_campaigns_season"
      ON "product_test_campaigns" ("season_id");
    `);

    // ============================================
    // 16. PRICE HISTORY TABLE
    // ============================================
    await queryRunner.query(`
      CREATE TABLE "price_history" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "product_id" uuid NOT NULL,
        "price_type" varchar(50) NOT NULL,
        "old_price" numeric(19,4) NOT NULL,
        "new_price" numeric(19,4) NOT NULL,
        "changed_by" uuid NOT NULL,
        "reason" text,
        "changed_at" timestamptz NOT NULL DEFAULT now(),
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "PK_price_history" PRIMARY KEY ("id")
      );
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_price_history_product_date"
      ON "price_history" ("product_id", "changed_at");
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_price_history_type_date"
      ON "price_history" ("price_type", "changed_at");
    `);

    // ============================================
    // 17. COUPON USAGE TABLE
    // ============================================
    await queryRunner.query(`
      CREATE TABLE "coupon_usages" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "voucher_id" uuid NOT NULL,
        "account_id" uuid NOT NULL,
        "order_id" uuid NOT NULL,
        "discount_amount" numeric(19,4) NOT NULL,
        "used_at" timestamptz NOT NULL DEFAULT now(),
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "PK_coupon_usages" PRIMARY KEY ("id")
      );
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_coupon_usages_voucher_account"
      ON "coupon_usages" ("voucher_id", "account_id");
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_coupon_usages_voucher_date"
      ON "coupon_usages" ("voucher_id", "used_at");
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_coupon_usages_account_date"
      ON "coupon_usages" ("account_id", "used_at");
    `);

    // ============================================
    // 18. COUPON PRODUCTS TABLE
    // ============================================
    await queryRunner.query(`
      CREATE TABLE "coupon_products" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "voucher_id" uuid NOT NULL,
        "product_id" uuid NOT NULL,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "PK_coupon_products" PRIMARY KEY ("id")
      );
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_coupon_products_voucher"
      ON "coupon_products" ("voucher_id");
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_coupon_products_product"
      ON "coupon_products" ("product_id");
    `);

    // ============================================
    // 19. COUPON SEASONS TABLE
    // ============================================
    await queryRunner.query(`
      CREATE TABLE "coupon_seasons" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "voucher_id" uuid NOT NULL,
        "season_id" uuid NOT NULL,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "PK_coupon_seasons" PRIMARY KEY ("id")
      );
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_coupon_seasons_voucher"
      ON "coupon_seasons" ("voucher_id");
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_coupon_seasons_season"
      ON "coupon_seasons" ("season_id");
    `);

    // ============================================
    // 20. COUPON PACKAGES TABLE
    // ============================================
    await queryRunner.query(`
      CREATE TABLE "coupon_packages" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "voucher_id" uuid NOT NULL,
        "package_id" uuid NOT NULL,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "PK_coupon_packages" PRIMARY KEY ("id")
      );
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_coupon_packages_voucher"
      ON "coupon_packages" ("voucher_id");
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_coupon_packages_package"
      ON "coupon_packages" ("package_id");
    `);

    // ============================================
    // 21. ADD FOREIGN KEY CONSTRAINTS
    // ============================================

    // Chung Suc Campaigns
    await queryRunner.query(`
      ALTER TABLE "chung_suc_campaigns"
      ADD CONSTRAINT "FK_chung_suc_campaigns_season"
      FOREIGN KEY ("season_id") REFERENCES "seasons"("id") ON DELETE SET NULL;
    `);

    await queryRunner.query(`
      ALTER TABLE "chung_suc_campaigns"
      ADD CONSTRAINT "FK_chung_suc_campaigns_product"
      FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE;
    `);

    // Chung Suc Participants
    await queryRunner.query(`
      ALTER TABLE "chung_suc_participants"
      ADD CONSTRAINT "FK_chung_suc_participants_campaign"
      FOREIGN KEY ("campaign_id") REFERENCES "chung_suc_campaigns"("id") ON DELETE CASCADE;
    `);

    await queryRunner.query(`
      ALTER TABLE "chung_suc_participants"
      ADD CONSTRAINT "FK_chung_suc_participants_account"
      FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE CASCADE;
    `);

    await queryRunner.query(`
      ALTER TABLE "chung_suc_participants"
      ADD CONSTRAINT "FK_chung_suc_participants_order"
      FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE SET NULL;
    `);

    // Price Tiers
    await queryRunner.query(`
      ALTER TABLE "price_tiers"
      ADD CONSTRAINT "FK_price_tiers_product"
      FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE;
    `);

    await queryRunner.query(`
      ALTER TABLE "price_tiers"
      ADD CONSTRAINT "FK_price_tiers_season"
      FOREIGN KEY ("season_id") REFERENCES "seasons"("id") ON DELETE SET NULL;
    `);

    // Packages
    await queryRunner.query(`
      ALTER TABLE "packages"
      ADD CONSTRAINT "FK_packages_season"
      FOREIGN KEY ("season_id") REFERENCES "seasons"("id") ON DELETE SET NULL;
    `);

    // Package Products
    await queryRunner.query(`
      ALTER TABLE "package_products"
      ADD CONSTRAINT "FK_package_products_package"
      FOREIGN KEY ("package_id") REFERENCES "packages"("id") ON DELETE CASCADE;
    `);

    await queryRunner.query(`
      ALTER TABLE "package_products"
      ADD CONSTRAINT "FK_package_products_product"
      FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE;
    `);

    // Seller Profiles
    await queryRunner.query(`
      ALTER TABLE "seller_profiles"
      ADD CONSTRAINT "FK_seller_profiles_account"
      FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE CASCADE;
    `);

    // Seller Referral Codes
    await queryRunner.query(`
      ALTER TABLE "seller_referral_codes"
      ADD CONSTRAINT "FK_seller_referral_codes_seller"
      FOREIGN KEY ("seller_id") REFERENCES "seller_profiles"("id") ON DELETE CASCADE;
    `);

    // Referral Clicks
    await queryRunner.query(`
      ALTER TABLE "referral_clicks"
      ADD CONSTRAINT "FK_referral_clicks_code"
      FOREIGN KEY ("referral_code_id") REFERENCES "seller_referral_codes"("id") ON DELETE CASCADE;
    `);

    // Purchase Batches
    await queryRunner.query(`
      ALTER TABLE "purchase_batches"
      ADD CONSTRAINT "FK_purchase_batches_product"
      FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE;
    `);

    await queryRunner.query(`
      ALTER TABLE "purchase_batches"
      ADD CONSTRAINT "FK_purchase_batches_season"
      FOREIGN KEY ("season_id") REFERENCES "seasons"("id") ON DELETE SET NULL;
    `);

    // Cost Tiers
    await queryRunner.query(`
      ALTER TABLE "cost_tiers"
      ADD CONSTRAINT "FK_cost_tiers_product"
      FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE;
    `);

    // Profit Records
    await queryRunner.query(`
      ALTER TABLE "profit_records"
      ADD CONSTRAINT "FK_profit_records_order"
      FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE CASCADE;
    `);

    await queryRunner.query(`
      ALTER TABLE "profit_records"
      ADD CONSTRAINT "FK_profit_records_product"
      FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE;
    `);

    await queryRunner.query(`
      ALTER TABLE "profit_records"
      ADD CONSTRAINT "FK_profit_records_season"
      FOREIGN KEY ("season_id") REFERENCES "seasons"("id") ON DELETE SET NULL;
    `);

    // Product Test Campaigns
    await queryRunner.query(`
      ALTER TABLE "product_test_campaigns"
      ADD CONSTRAINT "FK_product_test_campaigns_product"
      FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE;
    `);

    await queryRunner.query(`
      ALTER TABLE "product_test_campaigns"
      ADD CONSTRAINT "FK_product_test_campaigns_season"
      FOREIGN KEY ("season_id") REFERENCES "seasons"("id") ON DELETE SET NULL;
    `);

    // Price History
    await queryRunner.query(`
      ALTER TABLE "price_history"
      ADD CONSTRAINT "FK_price_history_product"
      FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE;
    `);

    await queryRunner.query(`
      ALTER TABLE "price_history"
      ADD CONSTRAINT "FK_price_history_admin"
      FOREIGN KEY ("changed_by") REFERENCES "accounts"("id") ON DELETE CASCADE;
    `);

    // Coupon Usages
    await queryRunner.query(`
      ALTER TABLE "coupon_usages"
      ADD CONSTRAINT "FK_coupon_usages_voucher"
      FOREIGN KEY ("voucher_id") REFERENCES "vouchers"("id") ON DELETE CASCADE;
    `);

    await queryRunner.query(`
      ALTER TABLE "coupon_usages"
      ADD CONSTRAINT "FK_coupon_usages_account"
      FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE CASCADE;
    `);

    await queryRunner.query(`
      ALTER TABLE "coupon_usages"
      ADD CONSTRAINT "FK_coupon_usages_order"
      FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE CASCADE;
    `);

    // Coupon Products
    await queryRunner.query(`
      ALTER TABLE "coupon_products"
      ADD CONSTRAINT "FK_coupon_products_voucher"
      FOREIGN KEY ("voucher_id") REFERENCES "vouchers"("id") ON DELETE CASCADE;
    `);

    await queryRunner.query(`
      ALTER TABLE "coupon_products"
      ADD CONSTRAINT "FK_coupon_products_product"
      FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE;
    `);

    // Coupon Seasons
    await queryRunner.query(`
      ALTER TABLE "coupon_seasons"
      ADD CONSTRAINT "FK_coupon_seasons_voucher"
      FOREIGN KEY ("voucher_id") REFERENCES "vouchers"("id") ON DELETE CASCADE;
    `);

    await queryRunner.query(`
      ALTER TABLE "coupon_seasons"
      ADD CONSTRAINT "FK_coupon_seasons_season"
      FOREIGN KEY ("season_id") REFERENCES "seasons"("id") ON DELETE CASCADE;
    `);

    // Coupon Packages
    await queryRunner.query(`
      ALTER TABLE "coupon_packages"
      ADD CONSTRAINT "FK_coupon_packages_voucher"
      FOREIGN KEY ("voucher_id") REFERENCES "vouchers"("id") ON DELETE CASCADE;
    `);

    await queryRunner.query(`
      ALTER TABLE "coupon_packages"
      ADD CONSTRAINT "FK_coupon_packages_package"
      FOREIGN KEY ("package_id") REFERENCES "packages"("id") ON DELETE CASCADE;
    `);

    // ============================================
    // 22. EXTEND EXISTING TABLES
    // ============================================

    // Add season_id to products table
    await queryRunner.query(`
      ALTER TABLE "products"
      ADD COLUMN "season_id" uuid;
    `);

    await queryRunner.query(`
      ALTER TABLE "products"
      ADD CONSTRAINT "FK_products_season"
      FOREIGN KEY ("season_id") REFERENCES "seasons"("id") ON DELETE SET NULL;
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_products_season" ON "products" ("season_id");
    `);

    // Add minimum_selling_price to products table
    await queryRunner.query(`
      ALTER TABLE "products"
      ADD COLUMN "minimum_selling_price" numeric(19,4);
    `);

    // Add seller tracking to orders table
    await queryRunner.query(`
      ALTER TABLE "orders"
      ADD COLUMN "seller_id" uuid;
    `);

    await queryRunner.query(`
      ALTER TABLE "orders"
      ADD COLUMN "seller_code" varchar(100);
    `);

    await queryRunner.query(`
      ALTER TABLE "orders"
      ADD COLUMN "season_id" uuid;
    `);

    await queryRunner.query(`
      ALTER TABLE "orders"
      ADD COLUMN "campaign_id" uuid;
    `);

    await queryRunner.query(`
      ALTER TABLE "orders"
      ADD COLUMN "package_id" uuid;
    `);

    await queryRunner.query(`
      ALTER TABLE "orders"
      ADD CONSTRAINT "FK_orders_seller"
      FOREIGN KEY ("seller_id") REFERENCES "seller_profiles"("id") ON DELETE SET NULL;
    `);

    await queryRunner.query(`
      ALTER TABLE "orders"
      ADD CONSTRAINT "FK_orders_season"
      FOREIGN KEY ("season_id") REFERENCES "seasons"("id") ON DELETE SET NULL;
    `);

    await queryRunner.query(`
      ALTER TABLE "orders"
      ADD CONSTRAINT "FK_orders_campaign"
      FOREIGN KEY ("campaign_id") REFERENCES "chung_suc_campaigns"("id") ON DELETE SET NULL;
    `);

    await queryRunner.query(`
      ALTER TABLE "orders"
      ADD CONSTRAINT "FK_orders_package"
      FOREIGN KEY ("package_id") REFERENCES "packages"("id") ON DELETE SET NULL;
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_orders_seller" ON "orders" ("seller_id");
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_orders_season" ON "orders" ("season_id");
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_orders_campaign" ON "orders" ("campaign_id");
    `);

    // Extend vouchers table for advanced coupon features
    await queryRunner.query(`
      ALTER TABLE "vouchers"
      ADD COLUMN "applicable_roles" jsonb;
    `);

    await queryRunner.query(`
      ALTER TABLE "vouchers"
      ADD COLUMN "stackable" boolean DEFAULT false;
    `);

    await queryRunner.query(`
      ALTER TABLE "vouchers"
      ADD COLUMN "priority" int DEFAULT 0;
    `);

    await queryRunner.query(`
      ALTER TABLE "vouchers"
      ADD COLUMN "usage_per_user" int;
    `);

    await queryRunner.query(`
      ALTER TABLE "vouchers"
      ADD COLUMN "current_usage" int DEFAULT 0;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Drop foreign keys first
    await queryRunner.query(`ALTER TABLE "orders" DROP CONSTRAINT IF EXISTS "FK_orders_package"`);
    await queryRunner.query(`ALTER TABLE "orders" DROP CONSTRAINT IF EXISTS "FK_orders_campaign"`);
    await queryRunner.query(`ALTER TABLE "orders" DROP CONSTRAINT IF EXISTS "FK_orders_season"`);
    await queryRunner.query(`ALTER TABLE "orders" DROP CONSTRAINT IF EXISTS "FK_orders_seller"`);
    await queryRunner.query(`ALTER TABLE "products" DROP CONSTRAINT IF EXISTS "FK_products_season"`);

    // Drop added columns from existing tables
    await queryRunner.query(`ALTER TABLE "vouchers" DROP COLUMN IF EXISTS "current_usage"`);
    await queryRunner.query(`ALTER TABLE "vouchers" DROP COLUMN IF EXISTS "usage_per_user"`);
    await queryRunner.query(`ALTER TABLE "vouchers" DROP COLUMN IF EXISTS "priority"`);
    await queryRunner.query(`ALTER TABLE "vouchers" DROP COLUMN IF EXISTS "stackable"`);
    await queryRunner.query(`ALTER TABLE "vouchers" DROP COLUMN IF EXISTS "applicable_roles"`);
    await queryRunner.query(`ALTER TABLE "orders" DROP COLUMN IF EXISTS "package_id"`);
    await queryRunner.query(`ALTER TABLE "orders" DROP COLUMN IF EXISTS "campaign_id"`);
    await queryRunner.query(`ALTER TABLE "orders" DROP COLUMN IF EXISTS "season_id"`);
    await queryRunner.query(`ALTER TABLE "orders" DROP COLUMN IF EXISTS "seller_code"`);
    await queryRunner.query(`ALTER TABLE "orders" DROP COLUMN IF EXISTS "seller_id"`);
    await queryRunner.query(`ALTER TABLE "products" DROP COLUMN IF EXISTS "minimum_selling_price"`);
    await queryRunner.query(`ALTER TABLE "products" DROP COLUMN IF EXISTS "season_id"`);

    // Drop all new tables
    await queryRunner.query(`DROP TABLE IF EXISTS "coupon_packages"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "coupon_seasons"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "coupon_products"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "coupon_usages"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "price_history"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "product_test_campaigns"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "profit_records"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "cost_tiers"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "purchase_batches"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "referral_clicks"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "seller_referral_codes"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "seller_profiles"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "package_products"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "packages"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "price_tiers"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "price_rules"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "chung_suc_participants"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "chung_suc_campaigns"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "seasons"`);

    // Drop enums
    await queryRunner.query(`DROP TYPE IF EXISTS "test_campaign_status_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "seller_approval_status_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "discount_type_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "price_rule_type_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "campaign_status_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "season_status_enum"`);
  }
}
