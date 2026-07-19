ALTER TABLE "order_refunds"
  DROP CONSTRAINT "order_refunds_order_payment_id_order_payments_id_fk";

ALTER TABLE "order_refunds"
  ALTER COLUMN "order_payment_id" SET NOT NULL;

ALTER TABLE "order_refunds"
  ADD CONSTRAINT "order_refunds_order_payment_id_order_payments_id_fk"
  FOREIGN KEY ("order_payment_id") REFERENCES "public"."order_payments"("id")
  ON DELETE restrict ON UPDATE no action;
