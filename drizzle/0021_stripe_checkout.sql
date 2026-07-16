ALTER TABLE "orders"
  ADD COLUMN "payment_amount" numeric(10, 2),
  ADD COLUMN "payment_currency" text,
  ADD COLUMN "stripe_checkout_session_id" text,
  ADD COLUMN "stripe_payment_intent_id" text,
  ADD COLUMN "payment_expires_at" timestamp,
  ADD COLUMN "paid_at" timestamp;

CREATE UNIQUE INDEX "orders_stripe_checkout_session_unique"
  ON "orders" USING btree ("stripe_checkout_session_id");
CREATE UNIQUE INDEX "orders_stripe_payment_intent_unique"
  ON "orders" USING btree ("stripe_payment_intent_id");
