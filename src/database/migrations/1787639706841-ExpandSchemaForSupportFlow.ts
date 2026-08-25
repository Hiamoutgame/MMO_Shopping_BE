import { MigrationInterface, QueryRunner } from 'typeorm';

export class ExpandSchemaForSupportFlow1787639706841 implements MigrationInterface {
  name = 'ExpandSchemaForSupportFlow1787639706841';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
            CREATE TABLE "roles" (
                "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
                "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                "deleted_at" TIMESTAMP WITH TIME ZONE,
                "code" character varying(50) NOT NULL,
                "name" character varying(100) NOT NULL,
                "description" text,
                CONSTRAINT "UQ_f6d54f95c31b73fb1bdd8e91d0c" UNIQUE ("code"),
                CONSTRAINT "PK_c1433d71a4838793a49dcad46ab" PRIMARY KEY ("id")
            )
        `);
    await queryRunner.query(`
            CREATE TYPE "public"."accounts_status_enum" AS ENUM('ACTIVE', 'INACTIVE', 'SUSPENDED')
        `);
    await queryRunner.query(`
            CREATE TABLE "accounts" (
                "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
                "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                "deleted_at" TIMESTAMP WITH TIME ZONE,
                "role_id" uuid NOT NULL,
                "email" character varying(255) NOT NULL,
                "password_hash" character varying(255) NOT NULL,
                "name" character varying(100) NOT NULL,
                "phone" character varying(20),
                "status" "public"."accounts_status_enum" NOT NULL DEFAULT 'ACTIVE',
                "last_login_at" TIMESTAMP WITH TIME ZONE,
                CONSTRAINT "UQ_ee66de6cdc53993296d1ceb8aa0" UNIQUE ("email"),
                CONSTRAINT "PK_5a7a02c20412299d198e097a8fe" PRIMARY KEY ("id")
            )
        `);
    await queryRunner.query(`
            CREATE INDEX "idx_accounts_role_id" ON "accounts" ("role_id")
        `);
    await queryRunner.query(`
            CREATE TABLE "categories" (
                "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
                "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                "deleted_at" TIMESTAMP WITH TIME ZONE,
                "parent_id" uuid,
                "name" character varying(100) NOT NULL,
                "slug" character varying(150) NOT NULL,
                "is_active" boolean NOT NULL DEFAULT true,
                "description" text,
                CONSTRAINT "UQ_420d9f679d41281f282f5bc7d09" UNIQUE ("slug"),
                CONSTRAINT "PK_24dbc6126a28ff948da33e97d3b" PRIMARY KEY ("id")
            )
        `);
    await queryRunner.query(`
            CREATE INDEX "idx_categories_parent_id" ON "categories" ("parent_id")
        `);
    await queryRunner.query(`
            CREATE TABLE "product_categories" (
                "product_id" uuid NOT NULL,
                "category_id" uuid NOT NULL,
                "is_primary" boolean NOT NULL DEFAULT false,
                "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                CONSTRAINT "PK_54f2e1dbf14cfa770f59f0aac8f" PRIMARY KEY ("product_id", "category_id")
            )
        `);
    await queryRunner.query(`
            CREATE UNIQUE INDEX "uq_product_categories_primary_per_product" ON "product_categories" ("product_id")
            WHERE "is_primary" = true
        `);
    await queryRunner.query(`
            CREATE TYPE "public"."products_status_enum" AS ENUM('DRAFT', 'ACTIVE', 'INACTIVE', 'ARCHIVED')
        `);
    await queryRunner.query(`
            CREATE TABLE "products" (
                "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
                "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                "deleted_at" TIMESTAMP WITH TIME ZONE,
                "name" character varying(255) NOT NULL,
                "slug" character varying(255) NOT NULL,
                "status" "public"."products_status_enum" NOT NULL DEFAULT 'DRAFT',
                "description" text,
                "images" jsonb,
                CONSTRAINT "UQ_464f927ae360106b783ed0b4106" UNIQUE ("slug"),
                CONSTRAINT "PK_0806c755e0aca124e67c0cf6d7d" PRIMARY KEY ("id")
            )
        `);
    await queryRunner.query(`
            CREATE INDEX "idx_products_status" ON "products" ("status")
        `);
    await queryRunner.query(`
            CREATE TYPE "public"."product_variants_fulfillment_type_enum" AS ENUM('AUTO', 'MANUAL', 'EXTERNAL')
        `);
    await queryRunner.query(`
            CREATE TYPE "public"."product_variants_status_enum" AS ENUM('ACTIVE', 'INACTIVE')
        `);
    await queryRunner.query(`
            CREATE TABLE "product_variants" (
                "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
                "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                "deleted_at" TIMESTAMP WITH TIME ZONE,
                "product_id" uuid NOT NULL,
                "sku" character varying(100) NOT NULL,
                "name" character varying(255) NOT NULL,
                "price" numeric(19, 4) NOT NULL,
                "fulfillment_type" "public"."product_variants_fulfillment_type_enum" NOT NULL,
                "status" "public"."product_variants_status_enum" NOT NULL DEFAULT 'ACTIVE',
                "attributes" jsonb,
                "duration_days" integer,
                "warranty_duration_days" integer,
                CONSTRAINT "UQ_46f236f21640f9da218a063a866" UNIQUE ("sku"),
                CONSTRAINT "chk_product_variants_price" CHECK (price >= 0),
                CONSTRAINT "PK_281e3f2c55652d6a22c0aa59fd7" PRIMARY KEY ("id")
            )
        `);
    await queryRunner.query(`
            CREATE INDEX "idx_product_variants_product_id" ON "product_variants" ("product_id")
        `);
    await queryRunner.query(`
            CREATE TABLE "order_items" (
                "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
                "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                "order_id" uuid NOT NULL,
                "product_variant_id" uuid NOT NULL,
                "product_name" character varying(255) NOT NULL,
                "variant_name" character varying(255) NOT NULL,
                "sku" character varying(100) NOT NULL,
                "unit_price" numeric(19, 4) NOT NULL,
                "quantity" integer NOT NULL,
                "total_amount" numeric(19, 4) NOT NULL,
                "warranty_expires_at" TIMESTAMP WITH TIME ZONE,
                CONSTRAINT "chk_order_items_total_amount" CHECK (total_amount = unit_price * quantity),
                CONSTRAINT "chk_order_items_quantity" CHECK (quantity > 0),
                CONSTRAINT "chk_order_items_unit_price" CHECK (unit_price >= 0),
                CONSTRAINT "PK_005269d8574e6fac0493715c308" PRIMARY KEY ("id")
            )
        `);
    await queryRunner.query(`
            CREATE INDEX "idx_order_items_order_id" ON "order_items" ("order_id")
        `);
    await queryRunner.query(`
            CREATE TYPE "public"."vouchers_discount_type_enum" AS ENUM('PERCENTAGE', 'FIXED_AMOUNT')
        `);
    await queryRunner.query(`
            CREATE TABLE "vouchers" (
                "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
                "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                "deleted_at" TIMESTAMP WITH TIME ZONE,
                "code" character varying(50) NOT NULL,
                "name" character varying(255) NOT NULL,
                "discount_type" "public"."vouchers_discount_type_enum" NOT NULL,
                "discount_value" numeric(19, 4) NOT NULL,
                "minimum_order_amount" numeric(19, 4),
                "maximum_discount_amount" numeric(19, 4),
                "usage_limit" integer NOT NULL,
                "per_account_limit" integer NOT NULL DEFAULT '1',
                "used_count" integer NOT NULL DEFAULT '0',
                "starts_at" TIMESTAMP WITH TIME ZONE NOT NULL,
                "ends_at" TIMESTAMP WITH TIME ZONE NOT NULL,
                "is_active" boolean NOT NULL DEFAULT true,
                CONSTRAINT "UQ_efc30b2b9169e05e0e1e19d6dd6" UNIQUE ("code"),
                CONSTRAINT "chk_vouchers_used_count" CHECK (used_count >= 0),
                CONSTRAINT "chk_vouchers_per_account_limit" CHECK (per_account_limit >= 0),
                CONSTRAINT "chk_vouchers_usage_limit" CHECK (usage_limit >= 0),
                CONSTRAINT "chk_vouchers_maximum_discount_amount" CHECK (
                    maximum_discount_amount IS NULL
                    OR maximum_discount_amount >= 0
                ),
                CONSTRAINT "chk_vouchers_minimum_order_amount" CHECK (
                    minimum_order_amount IS NULL
                    OR minimum_order_amount >= 0
                ),
                CONSTRAINT "chk_vouchers_ends_at" CHECK (ends_at > starts_at),
                CONSTRAINT "chk_vouchers_discount_value" CHECK (discount_value >= 0),
                CONSTRAINT "PK_ed1b7dd909a696560763acdbc04" PRIMARY KEY ("id")
            )
        `);
    await queryRunner.query(`
            CREATE TYPE "public"."orders_order_type_enum" AS ENUM('STANDARD', 'SUPPORT_CODE')
        `);
    await queryRunner.query(`
            CREATE TYPE "public"."orders_status_enum" AS ENUM(
                'PENDING',
                'PROCESSING',
                'COMPLETED',
                'CANCELLED',
                'REFUNDED'
            )
        `);
    await queryRunner.query(`
            CREATE TYPE "public"."orders_payment_status_enum" AS ENUM('PENDING', 'PAID', 'FAILED', 'REFUNDED')
        `);
    await queryRunner.query(`
            CREATE TABLE "orders" (
                "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
                "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                "account_id" uuid NOT NULL,
                "voucher_id" uuid,
                "order_number" character varying(32) NOT NULL,
                "order_type" "public"."orders_order_type_enum" NOT NULL DEFAULT 'STANDARD',
                "status" "public"."orders_status_enum" NOT NULL DEFAULT 'PENDING',
                "payment_status" "public"."orders_payment_status_enum" NOT NULL DEFAULT 'PENDING',
                "subtotal" numeric(19, 4) NOT NULL,
                "discount_amount" numeric(19, 4) NOT NULL DEFAULT '0',
                "total_amount" numeric(19, 4) NOT NULL,
                "currency" character(3) NOT NULL DEFAULT 'VND',
                "placed_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                CONSTRAINT "UQ_75eba1c6b1a66b09f2a97e6927b" UNIQUE ("order_number"),
                CONSTRAINT "chk_orders_total_amount" CHECK (total_amount = subtotal - discount_amount),
                CONSTRAINT "chk_orders_discount_not_gt_subtotal" CHECK (discount_amount <= subtotal),
                CONSTRAINT "chk_orders_discount_amount" CHECK (discount_amount >= 0),
                CONSTRAINT "chk_orders_subtotal" CHECK (subtotal >= 0),
                CONSTRAINT "PK_710e2d4957aa5878dfe94e4ac2f" PRIMARY KEY ("id")
            )
        `);
    await queryRunner.query(`
            CREATE INDEX "idx_orders_status" ON "orders" ("status")
        `);
    await queryRunner.query(`
            CREATE INDEX "idx_orders_account_id" ON "orders" ("account_id")
        `);
    await queryRunner.query(`
            CREATE TYPE "public"."integration_endpoints_auth_type_enum" AS ENUM('NONE', 'API_KEY', 'BEARER_TOKEN', 'HMAC')
        `);
    await queryRunner.query(`
            CREATE TABLE "integration_endpoints" (
                "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
                "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                "deleted_at" TIMESTAMP WITH TIME ZONE,
                "code" character varying(100) NOT NULL,
                "name" character varying(255) NOT NULL,
                "base_url" character varying(500) NOT NULL,
                "submit_path" character varying(255) NOT NULL,
                "callback_path" character varying(255),
                "auth_type" "public"."integration_endpoints_auth_type_enum" NOT NULL DEFAULT 'HMAC',
                "encrypted_credentials" text,
                "secret_key_version" integer NOT NULL DEFAULT '1',
                "timeout_ms" integer NOT NULL DEFAULT '10000',
                "priority" integer NOT NULL DEFAULT '0',
                "is_active" boolean NOT NULL DEFAULT true,
                "metadata" jsonb,
                CONSTRAINT "UQ_b1debdaab4db3d3e873286d87a9" UNIQUE ("code"),
                CONSTRAINT "chk_integration_endpoints_timeout_ms" CHECK (timeout_ms > 0),
                CONSTRAINT "chk_integration_endpoints_priority" CHECK (priority >= 0),
                CONSTRAINT "PK_3e512fe7ce9fe22bf520a046a2a" PRIMARY KEY ("id")
            )
        `);
    await queryRunner.query(`
            CREATE INDEX "idx_integration_endpoints_active" ON "integration_endpoints" ("is_active")
        `);
    await queryRunner.query(`
            CREATE TYPE "public"."support_dispatches_status_enum" AS ENUM(
                'PENDING',
                'SENT',
                'SUCCEEDED',
                'FAILED',
                'CANCELLED'
            )
        `);
    await queryRunner.query(`
            CREATE TABLE "support_dispatches" (
                "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
                "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                "request_id" uuid NOT NULL,
                "endpoint_id" uuid NOT NULL,
                "sequence" integer NOT NULL,
                "status" "public"."support_dispatches_status_enum" NOT NULL DEFAULT 'PENDING',
                "result" boolean,
                "attempts" integer NOT NULL DEFAULT '0',
                "external_request_id" character varying(120),
                "last_error" text,
                "sent_at" TIMESTAMP WITH TIME ZONE,
                "callback_received_at" TIMESTAMP WITH TIME ZONE,
                "metadata" jsonb,
                CONSTRAINT "uq_support_dispatches_request_endpoint" UNIQUE ("request_id", "endpoint_id"),
                CONSTRAINT "chk_support_dispatches_attempts" CHECK (attempts >= 0),
                CONSTRAINT "chk_support_dispatches_sequence" CHECK (sequence >= 0),
                CONSTRAINT "PK_a9bb6bcebec7058a6fade1afe89" PRIMARY KEY ("id")
            )
        `);
    await queryRunner.query(`
            CREATE UNIQUE INDEX "uq_support_dispatches_external_request_id" ON "support_dispatches" ("external_request_id")
            WHERE external_request_id IS NOT NULL
        `);
    await queryRunner.query(`
            CREATE INDEX "idx_support_dispatches_status" ON "support_dispatches" ("status")
        `);
    await queryRunner.query(`
            CREATE INDEX "idx_support_dispatches_request_id" ON "support_dispatches" ("request_id")
        `);
    await queryRunner.query(`
            CREATE TYPE "public"."support_code_requests_status_enum" AS ENUM(
                'ACTIVE',
                'PROCESSING',
                'SUCCESS',
                'PARTIAL_SUCCESS',
                'FAILED',
                'CANCELLED'
            )
        `);
    await queryRunner.query(`
            CREATE TABLE "support_code_requests" (
                "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
                "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                "account_id" uuid NOT NULL,
                "order_id" uuid,
                "code_hash" character varying(64) NOT NULL,
                "encrypted_code" text NOT NULL,
                "quantity" integer NOT NULL,
                "status" "public"."support_code_requests_status_enum" NOT NULL DEFAULT 'ACTIVE',
                "result_flags" boolean array NOT NULL DEFAULT '{}',
                "submitted_at" TIMESTAMP WITH TIME ZONE NOT NULL,
                "paid_at" TIMESTAMP WITH TIME ZONE,
                "completed_at" TIMESTAMP WITH TIME ZONE,
                "metadata" jsonb,
                CONSTRAINT "REL_f814249928907d0b66afad7c73" UNIQUE ("order_id"),
                CONSTRAINT "chk_support_code_requests_quantity" CHECK (quantity > 0),
                CONSTRAINT "PK_0266838d834b7d7aeebd5e73f9f" PRIMARY KEY ("id")
            )
        `);
    await queryRunner.query(`
            CREATE UNIQUE INDEX "uq_support_code_requests_order_id" ON "support_code_requests" ("order_id")
            WHERE order_id IS NOT NULL
        `);
    await queryRunner.query(`
            CREATE INDEX "idx_support_code_requests_status" ON "support_code_requests" ("status")
        `);
    await queryRunner.query(`
            CREATE INDEX "idx_support_code_requests_code_hash" ON "support_code_requests" ("code_hash")
        `);
    await queryRunner.query(`
            CREATE INDEX "idx_support_code_requests_account_id" ON "support_code_requests" ("account_id")
        `);
    await queryRunner.query(`
            CREATE TABLE "voucher_redemptions" (
                "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
                "voucher_id" uuid NOT NULL,
                "account_id" uuid NOT NULL,
                "order_id" uuid NOT NULL,
                "discount_amount" numeric(19, 4) NOT NULL,
                "redeemed_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                CONSTRAINT "PK_7597edcf0976617dad5154737f6" PRIMARY KEY ("id")
            )
        `);
    await queryRunner.query(`
            CREATE UNIQUE INDEX "uq_voucher_redemptions_order_id" ON "voucher_redemptions" ("order_id")
        `);
    await queryRunner.query(`
            CREATE INDEX "idx_voucher_redemptions_voucher_account" ON "voucher_redemptions" ("voucher_id", "account_id")
        `);
    await queryRunner.query(`
            CREATE TYPE "public"."wallet_transactions_type_enum" AS ENUM('CREDIT', 'DEBIT')
        `);
    await queryRunner.query(`
            CREATE TYPE "public"."wallet_transactions_status_enum" AS ENUM('PENDING', 'COMPLETED', 'FAILED', 'REVERSED')
        `);
    await queryRunner.query(`
            CREATE TABLE "wallet_transactions" (
                "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
                "wallet_id" uuid NOT NULL,
                "order_id" uuid,
                "payment_transaction_id" uuid,
                "type" "public"."wallet_transactions_type_enum" NOT NULL,
                "amount" numeric(19, 4) NOT NULL,
                "balance_before" numeric(19, 4) NOT NULL,
                "balance_after" numeric(19, 4) NOT NULL,
                "status" "public"."wallet_transactions_status_enum" NOT NULL DEFAULT 'COMPLETED',
                "idempotency_key" character varying(100) NOT NULL,
                "description" character varying(255),
                "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                CONSTRAINT "UQ_19f9490d8b3b06e15c41d879f26" UNIQUE ("idempotency_key"),
                CONSTRAINT "chk_wallet_transactions_balance_after" CHECK (balance_after >= 0),
                CONSTRAINT "chk_wallet_transactions_amount" CHECK (amount > 0),
                CONSTRAINT "PK_5120f131bde2cda940ec1a621db" PRIMARY KEY ("id")
            )
        `);
    await queryRunner.query(`
            CREATE UNIQUE INDEX "uq_wallet_transactions_payment_transaction_id" ON "wallet_transactions" ("payment_transaction_id")
            WHERE payment_transaction_id IS NOT NULL
        `);
    await queryRunner.query(`
            CREATE INDEX "idx_wallet_transactions_wallet_id" ON "wallet_transactions" ("wallet_id")
        `);
    await queryRunner.query(`
            CREATE TABLE "wallets" (
                "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
                "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                "account_id" uuid NOT NULL,
                "currency" character(3) NOT NULL DEFAULT 'VND',
                "balance" numeric(19, 4) NOT NULL DEFAULT '0',
                "version" integer NOT NULL DEFAULT '0',
                CONSTRAINT "UQ_3758a15697c5d6964552b6a9d1c" UNIQUE ("account_id"),
                CONSTRAINT "REL_3758a15697c5d6964552b6a9d1" UNIQUE ("account_id"),
                CONSTRAINT "chk_wallets_balance" CHECK (balance >= 0),
                CONSTRAINT "PK_8402e5df5a30a229380e83e4f7e" PRIMARY KEY ("id")
            )
        `);
    await queryRunner.query(`
            CREATE TYPE "public"."payment_transactions_provider_enum" AS ENUM('VNPAY', 'MOMO', 'ZALOPAY', 'BANK_TRANSFER')
        `);
    await queryRunner.query(`
            CREATE TYPE "public"."payment_transactions_type_enum" AS ENUM('DEPOSIT', 'REFUND')
        `);
    await queryRunner.query(`
            CREATE TYPE "public"."payment_transactions_status_enum" AS ENUM('PENDING', 'SUCCEEDED', 'FAILED', 'CANCELLED')
        `);
    await queryRunner.query(`
            CREATE TABLE "payment_transactions" (
                "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
                "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                "account_id" uuid NOT NULL,
                "wallet_id" uuid NOT NULL,
                "provider" "public"."payment_transactions_provider_enum" NOT NULL,
                "provider_transaction_id" character varying(100) NOT NULL,
                "type" "public"."payment_transactions_type_enum" NOT NULL,
                "amount" numeric(19, 4) NOT NULL,
                "currency" character(3) NOT NULL,
                "status" "public"."payment_transactions_status_enum" NOT NULL DEFAULT 'PENDING',
                "idempotency_key" character varying(100) NOT NULL,
                "metadata" jsonb,
                "completed_at" TIMESTAMP WITH TIME ZONE,
                CONSTRAINT "UQ_d7edd2fef60249360217fa9b008" UNIQUE ("idempotency_key"),
                CONSTRAINT "uq_payment_transactions_provider_tx" UNIQUE ("provider", "provider_transaction_id"),
                CONSTRAINT "chk_payment_transactions_amount" CHECK (amount > 0),
                CONSTRAINT "PK_d32b3c6b0d2c1d22604cbcc8c49" PRIMARY KEY ("id")
            )
        `);
    await queryRunner.query(`
            CREATE TABLE "auth_sessions" (
                "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
                "account_id" uuid NOT NULL,
                "refresh_token_hash" character varying(255) NOT NULL,
                "token_family" character varying(100) NOT NULL,
                "device_label" character varying(255),
                "ip_address" character varying(45),
                "user_agent" text,
                "expires_at" TIMESTAMP WITH TIME ZONE NOT NULL,
                "revoked_at" TIMESTAMP WITH TIME ZONE,
                "replaced_by_session_id" uuid,
                "reuse_detected_at" TIMESTAMP WITH TIME ZONE,
                "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                CONSTRAINT "UQ_8ae45196f82be4540770b41ac50" UNIQUE ("refresh_token_hash"),
                CONSTRAINT "PK_641507381f32580e8479efc36cd" PRIMARY KEY ("id")
            )
        `);
    await queryRunner.query(`
            CREATE INDEX "idx_auth_sessions_expires_at" ON "auth_sessions" ("expires_at")
        `);
    await queryRunner.query(`
            CREATE INDEX "idx_auth_sessions_account_id" ON "auth_sessions" ("account_id")
        `);
    await queryRunner.query(`
            CREATE TYPE "public"."inventory_items_status_enum" AS ENUM('AVAILABLE', 'RESERVED', 'SOLD', 'VOID')
        `);
    await queryRunner.query(`
            CREATE TABLE "inventory_items" (
                "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
                "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                "product_variant_id" uuid NOT NULL,
                "order_item_id" uuid,
                "encrypted_payload" text NOT NULL,
                "status" "public"."inventory_items_status_enum" NOT NULL DEFAULT 'AVAILABLE',
                "reserved_until" TIMESTAMP WITH TIME ZONE,
                "sold_at" TIMESTAMP WITH TIME ZONE,
                CONSTRAINT "PK_cf2f451407242e132547ac19169" PRIMARY KEY ("id")
            )
        `);
    await queryRunner.query(`
            CREATE INDEX "idx_inventory_items_order_item_id" ON "inventory_items" ("order_item_id")
        `);
    await queryRunner.query(`
            CREATE INDEX "idx_inventory_items_status" ON "inventory_items" ("status")
        `);
    await queryRunner.query(`
            CREATE INDEX "idx_inventory_items_product_variant_id" ON "inventory_items" ("product_variant_id")
        `);
    await queryRunner.query(`
            CREATE TABLE "carts" (
                "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
                "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                "account_id" uuid NOT NULL,
                CONSTRAINT "UQ_e0f5c205a0bf214c883893bdca1" UNIQUE ("account_id"),
                CONSTRAINT "REL_e0f5c205a0bf214c883893bdca" UNIQUE ("account_id"),
                CONSTRAINT "PK_b5f695a59f5ebb50af3c8160816" PRIMARY KEY ("id")
            )
        `);
    await queryRunner.query(`
            CREATE TABLE "cart_items" (
                "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
                "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                "cart_id" uuid NOT NULL,
                "product_variant_id" uuid NOT NULL,
                "quantity" integer NOT NULL,
                CONSTRAINT "uq_cart_items_cart_variant" UNIQUE ("cart_id", "product_variant_id"),
                CONSTRAINT "chk_cart_items_quantity" CHECK (quantity > 0),
                CONSTRAINT "PK_6fccf5ec03c172d27a28a82928b" PRIMARY KEY ("id")
            )
        `);
    await queryRunner.query(`
            CREATE TABLE "favorites" (
                "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
                "account_id" uuid NOT NULL,
                "product_id" uuid NOT NULL,
                "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                CONSTRAINT "uq_favorites_account_product" UNIQUE ("account_id", "product_id"),
                CONSTRAINT "PK_890818d27523748dd36a4d1bdc8" PRIMARY KEY ("id")
            )
        `);
    await queryRunner.query(`
            CREATE TABLE "product_views" (
                "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
                "account_id" uuid,
                "product_id" uuid NOT NULL,
                "session_id" character varying(100),
                "viewed_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                CONSTRAINT "PK_30b2bf7f11bc3f9604ffc95dc89" PRIMARY KEY ("id")
            )
        `);
    await queryRunner.query(`
            CREATE INDEX "idx_product_views_account_id" ON "product_views" ("account_id")
        `);
    await queryRunner.query(`
            CREATE INDEX "idx_product_views_product_id" ON "product_views" ("product_id")
        `);
    await queryRunner.query(`
            CREATE TYPE "public"."support_tickets_status_enum" AS ENUM(
                'OPEN',
                'PENDING_ADMIN',
                'PENDING_USER',
                'RESOLVED',
                'CLOSED'
            )
        `);
    await queryRunner.query(`
            CREATE TABLE "support_tickets" (
                "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
                "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                "account_id" uuid NOT NULL,
                "subject" character varying(255) NOT NULL,
                "status" "public"."support_tickets_status_enum" NOT NULL DEFAULT 'OPEN',
                "last_message_at" TIMESTAMP WITH TIME ZONE,
                "metadata" jsonb,
                CONSTRAINT "PK_942e8d8f5df86100471d2324643" PRIMARY KEY ("id")
            )
        `);
    await queryRunner.query(`
            CREATE INDEX "idx_support_tickets_status" ON "support_tickets" ("status")
        `);
    await queryRunner.query(`
            CREATE INDEX "idx_support_tickets_account_id" ON "support_tickets" ("account_id")
        `);
    await queryRunner.query(`
            CREATE TYPE "public"."support_messages_sender_type_enum" AS ENUM('USER', 'ADMIN', 'SYSTEM')
        `);
    await queryRunner.query(`
            CREATE TABLE "support_messages" (
                "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
                "ticket_id" uuid NOT NULL,
                "sender_account_id" uuid,
                "sender_type" "public"."support_messages_sender_type_enum" NOT NULL,
                "body" text NOT NULL,
                "attachments" jsonb,
                "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                CONSTRAINT "PK_2aa37479e71ef29cbf4dba2b1a2" PRIMARY KEY ("id")
            )
        `);
    await queryRunner.query(`
            CREATE INDEX "idx_support_messages_ticket_id" ON "support_messages" ("ticket_id")
        `);
    await queryRunner.query(`
            CREATE TYPE "public"."warranty_claims_status_enum" AS ENUM(
                'REQUESTED',
                'APPROVED',
                'REJECTED',
                'FULFILLED',
                'CANCELLED'
            )
        `);
    await queryRunner.query(`
            CREATE TABLE "warranty_claims" (
                "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
                "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                "account_id" uuid NOT NULL,
                "order_item_id" uuid NOT NULL,
                "original_inventory_item_id" uuid NOT NULL,
                "replacement_inventory_item_id" uuid,
                "status" "public"."warranty_claims_status_enum" NOT NULL DEFAULT 'REQUESTED',
                "reason" text NOT NULL,
                "admin_note" text,
                "resolved_at" TIMESTAMP WITH TIME ZONE,
                CONSTRAINT "PK_10984f957c4bc90ec2b9170214e" PRIMARY KEY ("id")
            )
        `);
    await queryRunner.query(`
            CREATE INDEX "idx_warranty_claims_status" ON "warranty_claims" ("status")
        `);
    await queryRunner.query(`
            CREATE INDEX "idx_warranty_claims_original_inventory_item_id" ON "warranty_claims" ("original_inventory_item_id")
        `);
    await queryRunner.query(`
            CREATE INDEX "idx_warranty_claims_account_id" ON "warranty_claims" ("account_id")
        `);
    await queryRunner.query(`
            CREATE TABLE "admin_audit_logs" (
                "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
                "admin_account_id" uuid NOT NULL,
                "action" character varying(120) NOT NULL,
                "target_type" character varying(100) NOT NULL,
                "target_id" uuid,
                "metadata" jsonb,
                "ip_address" character varying(45),
                "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                CONSTRAINT "PK_de7a8fc2fbb525484c71a86bb96" PRIMARY KEY ("id")
            )
        `);
    await queryRunner.query(`
            CREATE INDEX "idx_admin_audit_logs_target" ON "admin_audit_logs" ("target_type", "target_id")
        `);
    await queryRunner.query(`
            CREATE INDEX "idx_admin_audit_logs_admin_account_id" ON "admin_audit_logs" ("admin_account_id")
        `);
    await queryRunner.query(`
            CREATE TYPE "public"."outbox_events_status_enum" AS ENUM(
                'PENDING',
                'PROCESSING',
                'PROCESSED',
                'FAILED',
                'DEAD'
            )
        `);
    await queryRunner.query(`
            CREATE TABLE "outbox_events" (
                "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
                "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                "aggregate_type" character varying(100) NOT NULL,
                "aggregate_id" uuid NOT NULL,
                "event_type" character varying(120) NOT NULL,
                "status" "public"."outbox_events_status_enum" NOT NULL DEFAULT 'PENDING',
                "payload" jsonb NOT NULL,
                "attempts" integer NOT NULL DEFAULT '0',
                "idempotency_key" character varying(120),
                "not_before" TIMESTAMP WITH TIME ZONE,
                "processed_at" TIMESTAMP WITH TIME ZONE,
                "last_error" text,
                CONSTRAINT "chk_outbox_events_attempts" CHECK (attempts >= 0),
                CONSTRAINT "PK_6689a16c00d09b8089f6237f1d2" PRIMARY KEY ("id")
            )
        `);
    await queryRunner.query(`
            CREATE UNIQUE INDEX "uq_outbox_events_idempotency_key" ON "outbox_events" ("idempotency_key")
            WHERE idempotency_key IS NOT NULL
        `);
    await queryRunner.query(`
            CREATE INDEX "idx_outbox_events_status_not_before" ON "outbox_events" ("status", "not_before")
        `);
    await queryRunner.query(`
            CREATE TABLE "system_settings" (
                "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
                "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                "deleted_at" TIMESTAMP WITH TIME ZONE,
                "key" character varying(120) NOT NULL,
                "value" jsonb NOT NULL,
                "description" character varying(255),
                "is_public" boolean NOT NULL DEFAULT false,
                CONSTRAINT "UQ_b1b5bc664526d375c94ce9ad43d" UNIQUE ("key"),
                CONSTRAINT "PK_82521f08790d248b2a80cc85d40" PRIMARY KEY ("id")
            )
        `);
    await queryRunner.query(`
            ALTER TABLE "accounts"
            ADD CONSTRAINT "FK_181be57bee321617d2309faadcb" FOREIGN KEY ("role_id") REFERENCES "roles"("id") ON DELETE NO ACTION ON UPDATE NO ACTION
        `);
    await queryRunner.query(`
            ALTER TABLE "categories"
            ADD CONSTRAINT "FK_88cea2dc9c31951d06437879b40" FOREIGN KEY ("parent_id") REFERENCES "categories"("id") ON DELETE NO ACTION ON UPDATE NO ACTION
        `);
    await queryRunner.query(`
            ALTER TABLE "product_categories"
            ADD CONSTRAINT "FK_8748b4a0e8de6d266f2bbc877f6" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE NO ACTION
        `);
    await queryRunner.query(`
            ALTER TABLE "product_categories"
            ADD CONSTRAINT "FK_9148da8f26fc248e77a387e3112" FOREIGN KEY ("category_id") REFERENCES "categories"("id") ON DELETE CASCADE ON UPDATE NO ACTION
        `);
    await queryRunner.query(`
            ALTER TABLE "product_variants"
            ADD CONSTRAINT "FK_6343513e20e2deab45edfce1316" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE NO ACTION ON UPDATE NO ACTION
        `);
    await queryRunner.query(`
            ALTER TABLE "order_items"
            ADD CONSTRAINT "FK_145532db85752b29c57d2b7b1f1" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE NO ACTION
        `);
    await queryRunner.query(`
            ALTER TABLE "order_items"
            ADD CONSTRAINT "FK_11836543386b9135a47d54cab70" FOREIGN KEY ("product_variant_id") REFERENCES "product_variants"("id") ON DELETE NO ACTION ON UPDATE NO ACTION
        `);
    await queryRunner.query(`
            ALTER TABLE "orders"
            ADD CONSTRAINT "FK_83e17453a20deec5b0bc9de55a9" FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE NO ACTION ON UPDATE NO ACTION
        `);
    await queryRunner.query(`
            ALTER TABLE "orders"
            ADD CONSTRAINT "FK_3478da368b5a2f4b7690f44f711" FOREIGN KEY ("voucher_id") REFERENCES "vouchers"("id") ON DELETE NO ACTION ON UPDATE NO ACTION
        `);
    await queryRunner.query(`
            ALTER TABLE "support_dispatches"
            ADD CONSTRAINT "FK_4467f082e1b0644efe03f746c91" FOREIGN KEY ("request_id") REFERENCES "support_code_requests"("id") ON DELETE NO ACTION ON UPDATE NO ACTION
        `);
    await queryRunner.query(`
            ALTER TABLE "support_dispatches"
            ADD CONSTRAINT "FK_6cd83517bda603b6d4abe7d19e3" FOREIGN KEY ("endpoint_id") REFERENCES "integration_endpoints"("id") ON DELETE NO ACTION ON UPDATE NO ACTION
        `);
    await queryRunner.query(`
            ALTER TABLE "support_code_requests"
            ADD CONSTRAINT "FK_21d58475c28359f3d2054ca3ead" FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE NO ACTION ON UPDATE NO ACTION
        `);
    await queryRunner.query(`
            ALTER TABLE "support_code_requests"
            ADD CONSTRAINT "FK_f814249928907d0b66afad7c73f" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE NO ACTION ON UPDATE NO ACTION
        `);
    await queryRunner.query(`
            ALTER TABLE "voucher_redemptions"
            ADD CONSTRAINT "FK_0af64d5936a69889a91978ce812" FOREIGN KEY ("voucher_id") REFERENCES "vouchers"("id") ON DELETE NO ACTION ON UPDATE NO ACTION
        `);
    await queryRunner.query(`
            ALTER TABLE "voucher_redemptions"
            ADD CONSTRAINT "FK_d71c874a312823352b4e967830d" FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE NO ACTION ON UPDATE NO ACTION
        `);
    await queryRunner.query(`
            ALTER TABLE "voucher_redemptions"
            ADD CONSTRAINT "FK_aa83d09a91fe8cab704dc5c33ef" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE NO ACTION ON UPDATE NO ACTION
        `);
    await queryRunner.query(`
            ALTER TABLE "wallet_transactions"
            ADD CONSTRAINT "FK_c57d19129968160f4db28fc8b28" FOREIGN KEY ("wallet_id") REFERENCES "wallets"("id") ON DELETE NO ACTION ON UPDATE NO ACTION
        `);
    await queryRunner.query(`
            ALTER TABLE "wallet_transactions"
            ADD CONSTRAINT "FK_8aeb5b463c31d097315acf23945" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE NO ACTION ON UPDATE NO ACTION
        `);
    await queryRunner.query(`
            ALTER TABLE "wallet_transactions"
            ADD CONSTRAINT "FK_492d13159dd945786a7176cf4cc" FOREIGN KEY ("payment_transaction_id") REFERENCES "payment_transactions"("id") ON DELETE NO ACTION ON UPDATE NO ACTION
        `);
    await queryRunner.query(`
            ALTER TABLE "wallets"
            ADD CONSTRAINT "FK_3758a15697c5d6964552b6a9d1c" FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE NO ACTION ON UPDATE NO ACTION
        `);
    await queryRunner.query(`
            ALTER TABLE "payment_transactions"
            ADD CONSTRAINT "FK_793ecc8596ca290a6a399b2602b" FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE NO ACTION ON UPDATE NO ACTION
        `);
    await queryRunner.query(`
            ALTER TABLE "payment_transactions"
            ADD CONSTRAINT "FK_3ff208f17382d949fbfb96a6e97" FOREIGN KEY ("wallet_id") REFERENCES "wallets"("id") ON DELETE NO ACTION ON UPDATE NO ACTION
        `);
    await queryRunner.query(`
            ALTER TABLE "auth_sessions"
            ADD CONSTRAINT "FK_e2f49e419f7c78c8ac041f6fd27" FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE NO ACTION ON UPDATE NO ACTION
        `);
    await queryRunner.query(`
            ALTER TABLE "inventory_items"
            ADD CONSTRAINT "FK_7b49d2c28e5e4bb916532b480fa" FOREIGN KEY ("product_variant_id") REFERENCES "product_variants"("id") ON DELETE NO ACTION ON UPDATE NO ACTION
        `);
    await queryRunner.query(`
            ALTER TABLE "inventory_items"
            ADD CONSTRAINT "FK_6ef3a586cb636251b0049c8a5a7" FOREIGN KEY ("order_item_id") REFERENCES "order_items"("id") ON DELETE NO ACTION ON UPDATE NO ACTION
        `);
    await queryRunner.query(`
            ALTER TABLE "carts"
            ADD CONSTRAINT "FK_e0f5c205a0bf214c883893bdca1" FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE NO ACTION ON UPDATE NO ACTION
        `);
    await queryRunner.query(`
            ALTER TABLE "cart_items"
            ADD CONSTRAINT "FK_6385a745d9e12a89b859bb25623" FOREIGN KEY ("cart_id") REFERENCES "carts"("id") ON DELETE CASCADE ON UPDATE NO ACTION
        `);
    await queryRunner.query(`
            ALTER TABLE "cart_items"
            ADD CONSTRAINT "FK_de29bab7b2bb3b49c07253275f1" FOREIGN KEY ("product_variant_id") REFERENCES "product_variants"("id") ON DELETE NO ACTION ON UPDATE NO ACTION
        `);
    await queryRunner.query(`
            ALTER TABLE "favorites"
            ADD CONSTRAINT "FK_7ddfef5a1b4b89a47ffd5d42af6" FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE CASCADE ON UPDATE NO ACTION
        `);
    await queryRunner.query(`
            ALTER TABLE "favorites"
            ADD CONSTRAINT "FK_003e599a9fc0e8f154b6313639f" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE NO ACTION
        `);
    await queryRunner.query(`
            ALTER TABLE "product_views"
            ADD CONSTRAINT "FK_c3fc45f54744ebacd219779dc05" FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE NO ACTION ON UPDATE NO ACTION
        `);
    await queryRunner.query(`
            ALTER TABLE "product_views"
            ADD CONSTRAINT "FK_ca78d95dae75fe32fa233c134fa" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE NO ACTION ON UPDATE NO ACTION
        `);
    await queryRunner.query(`
            ALTER TABLE "support_tickets"
            ADD CONSTRAINT "FK_ec9879f91466197c18d4ad7bef1" FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE NO ACTION ON UPDATE NO ACTION
        `);
    await queryRunner.query(`
            ALTER TABLE "support_messages"
            ADD CONSTRAINT "FK_d5e0c744062d01ccda719d7ef17" FOREIGN KEY ("ticket_id") REFERENCES "support_tickets"("id") ON DELETE NO ACTION ON UPDATE NO ACTION
        `);
    await queryRunner.query(`
            ALTER TABLE "support_messages"
            ADD CONSTRAINT "FK_3ab5542dd3e0ce8c9e0b4d34671" FOREIGN KEY ("sender_account_id") REFERENCES "accounts"("id") ON DELETE NO ACTION ON UPDATE NO ACTION
        `);
    await queryRunner.query(`
            ALTER TABLE "warranty_claims"
            ADD CONSTRAINT "FK_a15aeb189dec9587a50a4f4f7c0" FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE NO ACTION ON UPDATE NO ACTION
        `);
    await queryRunner.query(`
            ALTER TABLE "warranty_claims"
            ADD CONSTRAINT "FK_1e61320e78e3bc9e91cf3f1c758" FOREIGN KEY ("order_item_id") REFERENCES "order_items"("id") ON DELETE NO ACTION ON UPDATE NO ACTION
        `);
    await queryRunner.query(`
            ALTER TABLE "warranty_claims"
            ADD CONSTRAINT "FK_391f7f00078d3fc88efa58fb94c" FOREIGN KEY ("original_inventory_item_id") REFERENCES "inventory_items"("id") ON DELETE NO ACTION ON UPDATE NO ACTION
        `);
    await queryRunner.query(`
            ALTER TABLE "warranty_claims"
            ADD CONSTRAINT "FK_fef6a45d4ce983b613099d54d1f" FOREIGN KEY ("replacement_inventory_item_id") REFERENCES "inventory_items"("id") ON DELETE NO ACTION ON UPDATE NO ACTION
        `);
    await queryRunner.query(`
            ALTER TABLE "admin_audit_logs"
            ADD CONSTRAINT "FK_36448d34c10d9db68765ba8e96d" FOREIGN KEY ("admin_account_id") REFERENCES "accounts"("id") ON DELETE NO ACTION ON UPDATE NO ACTION
        `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
            ALTER TABLE "admin_audit_logs" DROP CONSTRAINT "FK_36448d34c10d9db68765ba8e96d"
        `);
    await queryRunner.query(`
            ALTER TABLE "warranty_claims" DROP CONSTRAINT "FK_fef6a45d4ce983b613099d54d1f"
        `);
    await queryRunner.query(`
            ALTER TABLE "warranty_claims" DROP CONSTRAINT "FK_391f7f00078d3fc88efa58fb94c"
        `);
    await queryRunner.query(`
            ALTER TABLE "warranty_claims" DROP CONSTRAINT "FK_1e61320e78e3bc9e91cf3f1c758"
        `);
    await queryRunner.query(`
            ALTER TABLE "warranty_claims" DROP CONSTRAINT "FK_a15aeb189dec9587a50a4f4f7c0"
        `);
    await queryRunner.query(`
            ALTER TABLE "support_messages" DROP CONSTRAINT "FK_3ab5542dd3e0ce8c9e0b4d34671"
        `);
    await queryRunner.query(`
            ALTER TABLE "support_messages" DROP CONSTRAINT "FK_d5e0c744062d01ccda719d7ef17"
        `);
    await queryRunner.query(`
            ALTER TABLE "support_tickets" DROP CONSTRAINT "FK_ec9879f91466197c18d4ad7bef1"
        `);
    await queryRunner.query(`
            ALTER TABLE "product_views" DROP CONSTRAINT "FK_ca78d95dae75fe32fa233c134fa"
        `);
    await queryRunner.query(`
            ALTER TABLE "product_views" DROP CONSTRAINT "FK_c3fc45f54744ebacd219779dc05"
        `);
    await queryRunner.query(`
            ALTER TABLE "favorites" DROP CONSTRAINT "FK_003e599a9fc0e8f154b6313639f"
        `);
    await queryRunner.query(`
            ALTER TABLE "favorites" DROP CONSTRAINT "FK_7ddfef5a1b4b89a47ffd5d42af6"
        `);
    await queryRunner.query(`
            ALTER TABLE "cart_items" DROP CONSTRAINT "FK_de29bab7b2bb3b49c07253275f1"
        `);
    await queryRunner.query(`
            ALTER TABLE "cart_items" DROP CONSTRAINT "FK_6385a745d9e12a89b859bb25623"
        `);
    await queryRunner.query(`
            ALTER TABLE "carts" DROP CONSTRAINT "FK_e0f5c205a0bf214c883893bdca1"
        `);
    await queryRunner.query(`
            ALTER TABLE "inventory_items" DROP CONSTRAINT "FK_6ef3a586cb636251b0049c8a5a7"
        `);
    await queryRunner.query(`
            ALTER TABLE "inventory_items" DROP CONSTRAINT "FK_7b49d2c28e5e4bb916532b480fa"
        `);
    await queryRunner.query(`
            ALTER TABLE "auth_sessions" DROP CONSTRAINT "FK_e2f49e419f7c78c8ac041f6fd27"
        `);
    await queryRunner.query(`
            ALTER TABLE "payment_transactions" DROP CONSTRAINT "FK_3ff208f17382d949fbfb96a6e97"
        `);
    await queryRunner.query(`
            ALTER TABLE "payment_transactions" DROP CONSTRAINT "FK_793ecc8596ca290a6a399b2602b"
        `);
    await queryRunner.query(`
            ALTER TABLE "wallets" DROP CONSTRAINT "FK_3758a15697c5d6964552b6a9d1c"
        `);
    await queryRunner.query(`
            ALTER TABLE "wallet_transactions" DROP CONSTRAINT "FK_492d13159dd945786a7176cf4cc"
        `);
    await queryRunner.query(`
            ALTER TABLE "wallet_transactions" DROP CONSTRAINT "FK_8aeb5b463c31d097315acf23945"
        `);
    await queryRunner.query(`
            ALTER TABLE "wallet_transactions" DROP CONSTRAINT "FK_c57d19129968160f4db28fc8b28"
        `);
    await queryRunner.query(`
            ALTER TABLE "voucher_redemptions" DROP CONSTRAINT "FK_aa83d09a91fe8cab704dc5c33ef"
        `);
    await queryRunner.query(`
            ALTER TABLE "voucher_redemptions" DROP CONSTRAINT "FK_d71c874a312823352b4e967830d"
        `);
    await queryRunner.query(`
            ALTER TABLE "voucher_redemptions" DROP CONSTRAINT "FK_0af64d5936a69889a91978ce812"
        `);
    await queryRunner.query(`
            ALTER TABLE "support_code_requests" DROP CONSTRAINT "FK_f814249928907d0b66afad7c73f"
        `);
    await queryRunner.query(`
            ALTER TABLE "support_code_requests" DROP CONSTRAINT "FK_21d58475c28359f3d2054ca3ead"
        `);
    await queryRunner.query(`
            ALTER TABLE "support_dispatches" DROP CONSTRAINT "FK_6cd83517bda603b6d4abe7d19e3"
        `);
    await queryRunner.query(`
            ALTER TABLE "support_dispatches" DROP CONSTRAINT "FK_4467f082e1b0644efe03f746c91"
        `);
    await queryRunner.query(`
            ALTER TABLE "orders" DROP CONSTRAINT "FK_3478da368b5a2f4b7690f44f711"
        `);
    await queryRunner.query(`
            ALTER TABLE "orders" DROP CONSTRAINT "FK_83e17453a20deec5b0bc9de55a9"
        `);
    await queryRunner.query(`
            ALTER TABLE "order_items" DROP CONSTRAINT "FK_11836543386b9135a47d54cab70"
        `);
    await queryRunner.query(`
            ALTER TABLE "order_items" DROP CONSTRAINT "FK_145532db85752b29c57d2b7b1f1"
        `);
    await queryRunner.query(`
            ALTER TABLE "product_variants" DROP CONSTRAINT "FK_6343513e20e2deab45edfce1316"
        `);
    await queryRunner.query(`
            ALTER TABLE "product_categories" DROP CONSTRAINT "FK_9148da8f26fc248e77a387e3112"
        `);
    await queryRunner.query(`
            ALTER TABLE "product_categories" DROP CONSTRAINT "FK_8748b4a0e8de6d266f2bbc877f6"
        `);
    await queryRunner.query(`
            ALTER TABLE "categories" DROP CONSTRAINT "FK_88cea2dc9c31951d06437879b40"
        `);
    await queryRunner.query(`
            ALTER TABLE "accounts" DROP CONSTRAINT "FK_181be57bee321617d2309faadcb"
        `);
    await queryRunner.query(`
            DROP TABLE "system_settings"
        `);
    await queryRunner.query(`
            DROP INDEX "public"."idx_outbox_events_status_not_before"
        `);
    await queryRunner.query(`
            DROP INDEX "public"."uq_outbox_events_idempotency_key"
        `);
    await queryRunner.query(`
            DROP TABLE "outbox_events"
        `);
    await queryRunner.query(`
            DROP TYPE "public"."outbox_events_status_enum"
        `);
    await queryRunner.query(`
            DROP INDEX "public"."idx_admin_audit_logs_admin_account_id"
        `);
    await queryRunner.query(`
            DROP INDEX "public"."idx_admin_audit_logs_target"
        `);
    await queryRunner.query(`
            DROP TABLE "admin_audit_logs"
        `);
    await queryRunner.query(`
            DROP INDEX "public"."idx_warranty_claims_account_id"
        `);
    await queryRunner.query(`
            DROP INDEX "public"."idx_warranty_claims_original_inventory_item_id"
        `);
    await queryRunner.query(`
            DROP INDEX "public"."idx_warranty_claims_status"
        `);
    await queryRunner.query(`
            DROP TABLE "warranty_claims"
        `);
    await queryRunner.query(`
            DROP TYPE "public"."warranty_claims_status_enum"
        `);
    await queryRunner.query(`
            DROP INDEX "public"."idx_support_messages_ticket_id"
        `);
    await queryRunner.query(`
            DROP TABLE "support_messages"
        `);
    await queryRunner.query(`
            DROP TYPE "public"."support_messages_sender_type_enum"
        `);
    await queryRunner.query(`
            DROP INDEX "public"."idx_support_tickets_account_id"
        `);
    await queryRunner.query(`
            DROP INDEX "public"."idx_support_tickets_status"
        `);
    await queryRunner.query(`
            DROP TABLE "support_tickets"
        `);
    await queryRunner.query(`
            DROP TYPE "public"."support_tickets_status_enum"
        `);
    await queryRunner.query(`
            DROP INDEX "public"."idx_product_views_product_id"
        `);
    await queryRunner.query(`
            DROP INDEX "public"."idx_product_views_account_id"
        `);
    await queryRunner.query(`
            DROP TABLE "product_views"
        `);
    await queryRunner.query(`
            DROP TABLE "favorites"
        `);
    await queryRunner.query(`
            DROP TABLE "cart_items"
        `);
    await queryRunner.query(`
            DROP TABLE "carts"
        `);
    await queryRunner.query(`
            DROP INDEX "public"."idx_inventory_items_product_variant_id"
        `);
    await queryRunner.query(`
            DROP INDEX "public"."idx_inventory_items_status"
        `);
    await queryRunner.query(`
            DROP INDEX "public"."idx_inventory_items_order_item_id"
        `);
    await queryRunner.query(`
            DROP TABLE "inventory_items"
        `);
    await queryRunner.query(`
            DROP TYPE "public"."inventory_items_status_enum"
        `);
    await queryRunner.query(`
            DROP INDEX "public"."idx_auth_sessions_account_id"
        `);
    await queryRunner.query(`
            DROP INDEX "public"."idx_auth_sessions_expires_at"
        `);
    await queryRunner.query(`
            DROP TABLE "auth_sessions"
        `);
    await queryRunner.query(`
            DROP TABLE "payment_transactions"
        `);
    await queryRunner.query(`
            DROP TYPE "public"."payment_transactions_status_enum"
        `);
    await queryRunner.query(`
            DROP TYPE "public"."payment_transactions_type_enum"
        `);
    await queryRunner.query(`
            DROP TYPE "public"."payment_transactions_provider_enum"
        `);
    await queryRunner.query(`
            DROP TABLE "wallets"
        `);
    await queryRunner.query(`
            DROP INDEX "public"."idx_wallet_transactions_wallet_id"
        `);
    await queryRunner.query(`
            DROP INDEX "public"."uq_wallet_transactions_payment_transaction_id"
        `);
    await queryRunner.query(`
            DROP TABLE "wallet_transactions"
        `);
    await queryRunner.query(`
            DROP TYPE "public"."wallet_transactions_status_enum"
        `);
    await queryRunner.query(`
            DROP TYPE "public"."wallet_transactions_type_enum"
        `);
    await queryRunner.query(`
            DROP INDEX "public"."idx_voucher_redemptions_voucher_account"
        `);
    await queryRunner.query(`
            DROP INDEX "public"."uq_voucher_redemptions_order_id"
        `);
    await queryRunner.query(`
            DROP TABLE "voucher_redemptions"
        `);
    await queryRunner.query(`
            DROP INDEX "public"."idx_support_code_requests_account_id"
        `);
    await queryRunner.query(`
            DROP INDEX "public"."idx_support_code_requests_code_hash"
        `);
    await queryRunner.query(`
            DROP INDEX "public"."idx_support_code_requests_status"
        `);
    await queryRunner.query(`
            DROP INDEX "public"."uq_support_code_requests_order_id"
        `);
    await queryRunner.query(`
            DROP TABLE "support_code_requests"
        `);
    await queryRunner.query(`
            DROP TYPE "public"."support_code_requests_status_enum"
        `);
    await queryRunner.query(`
            DROP INDEX "public"."idx_support_dispatches_request_id"
        `);
    await queryRunner.query(`
            DROP INDEX "public"."idx_support_dispatches_status"
        `);
    await queryRunner.query(`
            DROP INDEX "public"."uq_support_dispatches_external_request_id"
        `);
    await queryRunner.query(`
            DROP TABLE "support_dispatches"
        `);
    await queryRunner.query(`
            DROP TYPE "public"."support_dispatches_status_enum"
        `);
    await queryRunner.query(`
            DROP INDEX "public"."idx_integration_endpoints_active"
        `);
    await queryRunner.query(`
            DROP TABLE "integration_endpoints"
        `);
    await queryRunner.query(`
            DROP TYPE "public"."integration_endpoints_auth_type_enum"
        `);
    await queryRunner.query(`
            DROP INDEX "public"."idx_orders_account_id"
        `);
    await queryRunner.query(`
            DROP INDEX "public"."idx_orders_status"
        `);
    await queryRunner.query(`
            DROP TABLE "orders"
        `);
    await queryRunner.query(`
            DROP TYPE "public"."orders_payment_status_enum"
        `);
    await queryRunner.query(`
            DROP TYPE "public"."orders_status_enum"
        `);
    await queryRunner.query(`
            DROP TYPE "public"."orders_order_type_enum"
        `);
    await queryRunner.query(`
            DROP TABLE "vouchers"
        `);
    await queryRunner.query(`
            DROP TYPE "public"."vouchers_discount_type_enum"
        `);
    await queryRunner.query(`
            DROP INDEX "public"."idx_order_items_order_id"
        `);
    await queryRunner.query(`
            DROP TABLE "order_items"
        `);
    await queryRunner.query(`
            DROP INDEX "public"."idx_product_variants_product_id"
        `);
    await queryRunner.query(`
            DROP TABLE "product_variants"
        `);
    await queryRunner.query(`
            DROP TYPE "public"."product_variants_status_enum"
        `);
    await queryRunner.query(`
            DROP TYPE "public"."product_variants_fulfillment_type_enum"
        `);
    await queryRunner.query(`
            DROP INDEX "public"."idx_products_status"
        `);
    await queryRunner.query(`
            DROP TABLE "products"
        `);
    await queryRunner.query(`
            DROP TYPE "public"."products_status_enum"
        `);
    await queryRunner.query(`
            DROP INDEX "public"."uq_product_categories_primary_per_product"
        `);
    await queryRunner.query(`
            DROP TABLE "product_categories"
        `);
    await queryRunner.query(`
            DROP INDEX "public"."idx_categories_parent_id"
        `);
    await queryRunner.query(`
            DROP TABLE "categories"
        `);
    await queryRunner.query(`
            DROP INDEX "public"."idx_accounts_role_id"
        `);
    await queryRunner.query(`
            DROP TABLE "accounts"
        `);
    await queryRunner.query(`
            DROP TYPE "public"."accounts_status_enum"
        `);
    await queryRunner.query(`
            DROP TABLE "roles"
        `);
  }
}
