CREATE TYPE "order_adjustment_type" AS ENUM (
  'DISCOUNT',
  'COMP',
  'SERVICE_CHARGE',
  'TIP'
);

CREATE TYPE "order_adjustment_scope" AS ENUM ('ORDER', 'ITEM');
CREATE TYPE "order_adjustment_calculation" AS ENUM ('FIXED_AMOUNT', 'PERCENTAGE');
CREATE TYPE "order_adjustment_entry_kind" AS ENUM ('APPLY', 'REVERSAL');
CREATE TYPE "order_adjustment_actor_type" AS ENUM ('CUSTOMER', 'STAFF', 'SYSTEM');

CREATE UNIQUE INDEX "orders_id_organization_unique"
  ON "orders" ("id", "organization_id");

CREATE UNIQUE INDEX "order_items_id_order_organization_unique"
  ON "order_items" ("id", "order_id", "organization_id");

CREATE TABLE "order_adjustments" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "organization_id" uuid NOT NULL REFERENCES "organizations"("id") ON DELETE cascade,
  "order_id" uuid NOT NULL,
  "order_item_id" uuid,
  "type" "order_adjustment_type" NOT NULL,
  "scope" "order_adjustment_scope" NOT NULL,
  "calculation" "order_adjustment_calculation" NOT NULL,
  "entry_kind" "order_adjustment_entry_kind" DEFAULT 'APPLY' NOT NULL,
  "basis_amount" numeric(10, 2) NOT NULL,
  "rate_bps" integer,
  "amount" numeric(10, 2) NOT NULL,
  "currency" text NOT NULL,
  "reason_code" text,
  "note" text,
  "actor_type" "order_adjustment_actor_type" NOT NULL,
  "actor_user_id" uuid REFERENCES "users"("id") ON DELETE set null,
  "actor_customer_id" uuid REFERENCES "customers"("id") ON DELETE set null,
  "reverses_adjustment_id" uuid REFERENCES "order_adjustments"("id") ON DELETE restrict,
  "idempotency_key" text NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "order_adjustments_order_organization_fk"
    FOREIGN KEY ("order_id", "organization_id")
    REFERENCES "orders"("id", "organization_id") ON DELETE cascade,
  CONSTRAINT "order_adjustments_item_order_organization_fk"
    FOREIGN KEY ("order_item_id", "order_id", "organization_id")
    REFERENCES "order_items"("id", "order_id", "organization_id") ON DELETE restrict,
  CONSTRAINT "order_adjustments_scope_check"
    CHECK (("scope" = 'ORDER' AND "order_item_id" IS NULL) OR ("scope" = 'ITEM' AND "order_item_id" IS NOT NULL)),
  CONSTRAINT "order_adjustments_calculation_check"
    CHECK (("calculation" = 'FIXED_AMOUNT' AND "rate_bps" IS NULL) OR ("calculation" = 'PERCENTAGE' AND "rate_bps" IS NOT NULL AND "rate_bps" > 0 AND "rate_bps" <= 10000)),
  CONSTRAINT "order_adjustments_amount_check"
    CHECK ("basis_amount" >= 0 AND "amount" > 0 AND ("type" NOT IN ('DISCOUNT', 'COMP') OR "amount" <= "basis_amount")),
  CONSTRAINT "order_adjustments_reason_check"
    CHECK ("type" NOT IN ('DISCOUNT', 'COMP') OR ("reason_code" IS NOT NULL AND char_length(btrim("reason_code")) > 0)),
  CONSTRAINT "order_adjustments_reversal_check"
    CHECK (("entry_kind" = 'APPLY' AND "reverses_adjustment_id" IS NULL) OR ("entry_kind" = 'REVERSAL' AND "reverses_adjustment_id" IS NOT NULL)),
  CONSTRAINT "order_adjustments_currency_check"
    CHECK (char_length("currency") = 3 AND "currency" = upper("currency")),
  CONSTRAINT "order_adjustments_actor_check"
    CHECK (("actor_type" = 'STAFF' AND "actor_customer_id" IS NULL) OR ("actor_type" = 'CUSTOMER' AND "actor_user_id" IS NULL) OR ("actor_type" = 'SYSTEM' AND "actor_user_id" IS NULL AND "actor_customer_id" IS NULL))
);

CREATE INDEX "order_adjustments_organization_order_created_idx"
  ON "order_adjustments" ("organization_id", "order_id", "created_at");

CREATE INDEX "order_adjustments_order_item_idx"
  ON "order_adjustments" ("order_item_id");

CREATE UNIQUE INDEX "order_adjustments_organization_idempotency_unique"
  ON "order_adjustments" ("organization_id", "idempotency_key");

CREATE UNIQUE INDEX "order_adjustments_reversal_unique"
  ON "order_adjustments" ("reverses_adjustment_id")
  WHERE "reverses_adjustment_id" IS NOT NULL;
