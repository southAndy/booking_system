import { MigrationInterface, QueryRunner } from 'typeorm';

export class AuthV11714800000001 implements MigrationInterface {
  name = 'AuthV11714800000001';

  public async up(q: QueryRunner): Promise<void> {
    await q.query(`
      ALTER TABLE "users"
      ADD COLUMN IF NOT EXISTS "email_verified_at" timestamptz NULL
    `);

    await q.query(`
      CREATE TABLE IF NOT EXISTS "email_verifications" (
        "verification_id" uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
        "user_id" uuid NOT NULL,
        "code_hash" varchar(255) NOT NULL,
        "attempt_count" int NOT NULL DEFAULT 0,
        "expires_at" timestamptz NOT NULL,
        "used_at" timestamptz NULL,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "fk_email_verifications_user" FOREIGN KEY ("user_id")
          REFERENCES "users"("id") ON DELETE CASCADE
      )
    `);
    await q.query(`
      CREATE INDEX IF NOT EXISTS "idx_email_verifications_user"
      ON "email_verifications"("user_id")
    `);

    await q.query(`
      CREATE TABLE IF NOT EXISTS "tokens" (
        "session_id" uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
        "user_id" uuid NOT NULL,
        "refresh_token_hash" varchar(255) NOT NULL,
        "device_info" varchar(255) NULL,
        "expires_at" timestamptz NOT NULL,
        "revoked" boolean NOT NULL DEFAULT false,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "last_used_at" timestamptz NULL,
        CONSTRAINT "fk_tokens_user" FOREIGN KEY ("user_id")
          REFERENCES "users"("id") ON DELETE CASCADE
      )
    `);
    await q.query(`
      CREATE INDEX IF NOT EXISTS "idx_tokens_user"
      ON "tokens"("user_id")
    `);
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(`DROP TABLE IF EXISTS "tokens"`);
    await q.query(`DROP TABLE IF EXISTS "email_verifications"`);
    await q.query(`ALTER TABLE "users" DROP COLUMN IF EXISTS "email_verified_at"`);
  }
}
