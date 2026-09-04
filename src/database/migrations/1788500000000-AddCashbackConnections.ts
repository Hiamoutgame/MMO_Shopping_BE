import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddCashbackConnections1788500000000 implements MigrationInterface {
  name = 'AddCashbackConnections1788500000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TYPE "cashback_connections_status_enum"
      AS ENUM ('CONNECTED', 'REAUTH_REQUIRED', 'DISCONNECTED')
    `);
    await queryRunner.query(`
      CREATE TABLE "cashback_connections" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "account_id" uuid NOT NULL,
        "provider_user_id" character varying(100),
        "provider_email" character varying(255),
        "token_type" character varying(30),
        "encrypted_access_token" text,
        "encrypted_challenge" text,
        "challenge_methods" jsonb,
        "challenge_expires_at" TIMESTAMP WITH TIME ZONE,
        "status" "cashback_connections_status_enum" NOT NULL DEFAULT 'DISCONNECTED',
        "connected_at" TIMESTAMP WITH TIME ZONE,
        "last_used_at" TIMESTAMP WITH TIME ZONE,
        "reauth_required_at" TIMESTAMP WITH TIME ZONE,
        CONSTRAINT "PK_cashback_connections" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_cashback_connections_account_id" UNIQUE ("account_id"),
        CONSTRAINT "FK_cashback_connections_account_id"
          FOREIGN KEY ("account_id") REFERENCES "accounts"("id")
          ON DELETE CASCADE ON UPDATE NO ACTION
      )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "cashback_connections"`);
    await queryRunner.query(`DROP TYPE "cashback_connections_status_enum"`);
  }
}
