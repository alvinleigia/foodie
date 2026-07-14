CREATE TYPE "social_auth_provider" AS ENUM (
  'GOOGLE',
  'APPLE',
  'FACEBOOK'
);

CREATE TABLE "organization_oauth_settings" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "organization_id" uuid NOT NULL,
  "provider" "social_auth_provider" NOT NULL,
  "mode" "integration_mode" DEFAULT 'INHERIT' NOT NULL,
  "client_id" text,
  "client_secret_encrypted" text,
  "client_secret_hint" text,
  "updated_by_user_id" uuid,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "organization_oauth_settings_organization_id_organizations_id_fk"
    FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id")
    ON DELETE cascade ON UPDATE no action,
  CONSTRAINT "organization_oauth_settings_updated_by_user_id_users_id_fk"
    FOREIGN KEY ("updated_by_user_id") REFERENCES "public"."users"("id")
    ON DELETE set null ON UPDATE no action
);

CREATE UNIQUE INDEX "organization_oauth_settings_org_provider_unique"
  ON "organization_oauth_settings" USING btree ("organization_id", "provider");
CREATE INDEX "organization_oauth_settings_mode_idx"
  ON "organization_oauth_settings" USING btree ("mode");
