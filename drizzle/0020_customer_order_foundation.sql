CREATE TYPE "order_source" AS ENUM (
  'CUSTOMER_SELF_SERVICE',
  'STAFF_CREATED'
);

CREATE TYPE "payment_status" AS ENUM (
  'NOT_REQUIRED',
  'PENDING',
  'PAID',
  'FAILED',
  'CANCELLED',
  'REFUNDED'
);

CREATE TABLE "customers" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "name" text NOT NULL,
  "email" text NOT NULL,
  "email_verified_at" timestamp,
  "phone" text,
  "phone_verified_at" timestamp,
  "date_of_birth" date,
  "gender" text,
  "marketing_opt_in" boolean DEFAULT false NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);

CREATE UNIQUE INDEX "customers_email_unique"
  ON "customers" USING btree (lower("email"));
CREATE INDEX "customers_phone_idx"
  ON "customers" USING btree ("phone");

CREATE TABLE "customer_oauth_accounts" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "customer_id" uuid NOT NULL,
  "provider" text NOT NULL,
  "provider_account_id" text NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "customer_oauth_accounts_customer_id_customers_id_fk"
    FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id")
    ON DELETE cascade ON UPDATE no action
);

CREATE INDEX "customer_oauth_accounts_customer_idx"
  ON "customer_oauth_accounts" USING btree ("customer_id");
CREATE UNIQUE INDEX "customer_oauth_accounts_provider_account_unique"
  ON "customer_oauth_accounts" USING btree ("provider", "provider_account_id");

ALTER TABLE "orders"
  ADD COLUMN "customer_id" uuid,
  ADD COLUMN "created_by_user_id" uuid,
  ADD COLUMN "source" "order_source" DEFAULT 'CUSTOMER_SELF_SERVICE' NOT NULL,
  ADD COLUMN "payment_status" "payment_status" DEFAULT 'NOT_REQUIRED' NOT NULL;

ALTER TABLE "orders"
  ADD CONSTRAINT "orders_customer_id_customers_id_fk"
  FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id")
  ON DELETE set null ON UPDATE no action;

ALTER TABLE "orders"
  ADD CONSTRAINT "orders_created_by_user_id_users_id_fk"
  FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id")
  ON DELETE set null ON UPDATE no action;

CREATE INDEX "orders_customer_created_idx"
  ON "orders" USING btree ("customer_id", "created_at");
CREATE INDEX "orders_created_by_user_idx"
  ON "orders" USING btree ("created_by_user_id");
CREATE INDEX "orders_payment_status_idx"
  ON "orders" USING btree ("payment_status");
