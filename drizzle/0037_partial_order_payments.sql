ALTER TYPE "payment_status"
  ADD VALUE IF NOT EXISTS 'PARTIALLY_PAID' AFTER 'UNPAID';

ALTER TABLE "orders"
  ADD COLUMN "payment_collected_amount" numeric(10, 2) DEFAULT 0 NOT NULL;

ALTER TABLE "order_refunds"
  ADD COLUMN "order_payment_id" uuid;

ALTER TABLE "order_refunds"
  ADD CONSTRAINT "order_refunds_order_payment_id_order_payments_id_fk"
  FOREIGN KEY ("order_payment_id") REFERENCES "public"."order_payments"("id")
  ON DELETE set null ON UPDATE no action;

ALTER TABLE "orders"
  DROP CONSTRAINT "orders_cancellation_amounts_check";

DROP INDEX "order_refunds_one_pending_per_cancellation_unique";
