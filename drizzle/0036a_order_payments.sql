CREATE TYPE "order_payment_method" AS ENUM (
  'CASH',
  'STRIPE_CHECKOUT'
);

CREATE TYPE "order_payment_record_status" AS ENUM (
  'PENDING',
  'SUCCEEDED',
  'FAILED',
  'CANCELLED'
);

CREATE TABLE "order_payments" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "organization_id" uuid NOT NULL,
  "order_id" uuid NOT NULL,
  "method" "order_payment_method" NOT NULL,
  "status" "order_payment_record_status" DEFAULT 'PENDING' NOT NULL,
  "amount" numeric(10, 2) NOT NULL,
  "currency" text NOT NULL,
  "tendered_amount" numeric(10, 2),
  "change_amount" numeric(10, 2),
  "received_by_user_id" uuid,
  "stripe_connected_account_id" text,
  "stripe_checkout_session_id" text,
  "stripe_payment_intent_id" text,
  "completed_at" timestamp,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "order_payments_organization_id_organizations_id_fk"
    FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id")
    ON DELETE cascade ON UPDATE no action,
  CONSTRAINT "order_payments_order_id_orders_id_fk"
    FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id")
    ON DELETE cascade ON UPDATE no action,
  CONSTRAINT "order_payments_received_by_user_id_users_id_fk"
    FOREIGN KEY ("received_by_user_id") REFERENCES "public"."users"("id")
    ON DELETE set null ON UPDATE no action,
  CONSTRAINT "order_payments_amount_check" CHECK ("amount" > 0),
  CONSTRAINT "order_payments_cash_amounts_check" CHECK (
    (
      "method" = 'CASH'
      AND "tendered_amount" IS NOT NULL
      AND "change_amount" IS NOT NULL
      AND "tendered_amount" >= "amount"
      AND "change_amount" = "tendered_amount" - "amount"
    ) OR (
      "method" = 'STRIPE_CHECKOUT'
      AND "tendered_amount" IS NULL
      AND "change_amount" IS NULL
    )
  )
);

CREATE INDEX "order_payments_organization_order_idx"
  ON "order_payments" USING btree ("organization_id", "order_id");

CREATE INDEX "order_payments_order_status_created_idx"
  ON "order_payments" USING btree ("order_id", "status", "created_at");

CREATE UNIQUE INDEX "order_payments_stripe_checkout_session_unique"
  ON "order_payments" USING btree ("stripe_checkout_session_id");

CREATE UNIQUE INDEX "order_payments_stripe_payment_intent_unique"
  ON "order_payments" USING btree ("stripe_payment_intent_id");
