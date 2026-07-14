CREATE TYPE "integration_mode" AS ENUM (
  'INHERIT',
  'CUSTOM',
  'DISABLED'
);

CREATE TYPE "email_provider" AS ENUM ('SMTP2GO');

CREATE TYPE "integration_verification_status" AS ENUM (
  'NOT_CONFIGURED',
  'PENDING',
  'VERIFIED',
  'FAILED'
);

CREATE TYPE "payment_provider" AS ENUM ('STRIPE');

CREATE TYPE "payment_onboarding_status" AS ENUM (
  'NOT_STARTED',
  'PENDING',
  'COMPLETE',
  'RESTRICTED'
);

CREATE TABLE "organization_email_settings" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "organization_id" uuid NOT NULL,
  "mode" "integration_mode" DEFAULT 'INHERIT' NOT NULL,
  "provider" "email_provider" DEFAULT 'SMTP2GO' NOT NULL,
  "from_name" text,
  "from_email" text,
  "reply_to_email" text,
  "api_key_encrypted" text,
  "api_key_hint" text,
  "verification_status" "integration_verification_status" DEFAULT 'NOT_CONFIGURED' NOT NULL,
  "last_tested_at" timestamp,
  "updated_by_user_id" uuid,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "organization_email_settings_organization_id_organizations_id_fk"
    FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id")
    ON DELETE cascade ON UPDATE no action,
  CONSTRAINT "organization_email_settings_updated_by_user_id_users_id_fk"
    FOREIGN KEY ("updated_by_user_id") REFERENCES "public"."users"("id")
    ON DELETE set null ON UPDATE no action
);

CREATE UNIQUE INDEX "organization_email_settings_org_unique"
  ON "organization_email_settings" USING btree ("organization_id");
CREATE INDEX "organization_email_settings_mode_idx"
  ON "organization_email_settings" USING btree ("mode");

CREATE TABLE "organization_payment_accounts" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "organization_id" uuid NOT NULL,
  "mode" "integration_mode" DEFAULT 'INHERIT' NOT NULL,
  "provider" "payment_provider" DEFAULT 'STRIPE' NOT NULL,
  "stripe_account_id" text,
  "onboarding_status" "payment_onboarding_status" DEFAULT 'NOT_STARTED' NOT NULL,
  "charges_enabled" boolean DEFAULT false NOT NULL,
  "payouts_enabled" boolean DEFAULT false NOT NULL,
  "details_submitted" boolean DEFAULT false NOT NULL,
  "application_fee_bps" integer DEFAULT 0 NOT NULL,
  "last_synced_at" timestamp,
  "updated_by_user_id" uuid,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "organization_payment_accounts_organization_id_organizations_id_fk"
    FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id")
    ON DELETE cascade ON UPDATE no action,
  CONSTRAINT "organization_payment_accounts_updated_by_user_id_users_id_fk"
    FOREIGN KEY ("updated_by_user_id") REFERENCES "public"."users"("id")
    ON DELETE set null ON UPDATE no action,
  CONSTRAINT "organization_payment_accounts_fee_bps_check"
    CHECK ("application_fee_bps" >= 0 AND "application_fee_bps" <= 10000)
);

CREATE UNIQUE INDEX "organization_payment_accounts_org_unique"
  ON "organization_payment_accounts" USING btree ("organization_id");
CREATE UNIQUE INDEX "organization_payment_accounts_stripe_unique"
  ON "organization_payment_accounts" USING btree ("stripe_account_id");
CREATE INDEX "organization_payment_accounts_mode_idx"
  ON "organization_payment_accounts" USING btree ("mode");

ALTER TABLE "orders"
  ADD COLUMN "payment_account_organization_id" uuid,
  ADD COLUMN "stripe_connected_account_id" text;

ALTER TABLE "orders"
  ADD CONSTRAINT "orders_payment_account_organization_id_organizations_id_fk"
  FOREIGN KEY ("payment_account_organization_id") REFERENCES "public"."organizations"("id")
  ON DELETE set null ON UPDATE no action;

CREATE INDEX "orders_payment_account_org_idx"
  ON "orders" USING btree ("payment_account_organization_id");
CREATE INDEX "orders_stripe_connected_account_idx"
  ON "orders" USING btree ("stripe_connected_account_id");
