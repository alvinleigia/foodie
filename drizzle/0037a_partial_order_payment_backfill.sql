UPDATE "orders"
SET "payment_collected_amount" = "payment_amount"
WHERE "payment_amount" IS NOT NULL
  AND "payment_status" IN (
    'PAID',
    'REFUND_PENDING',
    'PARTIALLY_REFUNDED',
    'REFUND_FAILED',
    'REFUNDED'
  );

UPDATE "order_payments" AS "payment"
SET
  "status" = 'SUCCEEDED',
  "amount" = "order"."payment_amount",
  "currency" = "order"."payment_currency",
  "stripe_connected_account_id" = "order"."stripe_connected_account_id",
  "stripe_payment_intent_id" = COALESCE(
    "payment"."stripe_payment_intent_id",
    "order"."stripe_payment_intent_id"
  ),
  "completed_at" = COALESCE(
    "payment"."completed_at",
    "order"."paid_at",
    "order"."created_at"
  ),
  "updated_at" = "order"."updated_at"
FROM "orders" AS "order"
WHERE "payment"."order_id" = "order"."id"
  AND "payment"."organization_id" = "order"."organization_id"
  AND "payment"."method" = 'STRIPE_CHECKOUT'
  AND "order"."payment_amount" IS NOT NULL
  AND "order"."payment_currency" IS NOT NULL
  AND "order"."payment_status" IN (
    'PAID',
    'REFUND_PENDING',
    'PARTIALLY_REFUNDED',
    'REFUND_FAILED',
    'REFUNDED'
  )
  AND (
    (
      "order"."stripe_checkout_session_id" IS NOT NULL
      AND "payment"."stripe_checkout_session_id" =
        "order"."stripe_checkout_session_id"
    )
    OR (
      "order"."stripe_payment_intent_id" IS NOT NULL
      AND "payment"."stripe_payment_intent_id" =
        "order"."stripe_payment_intent_id"
    )
  );

INSERT INTO "order_payments" (
  "organization_id",
  "order_id",
  "method",
  "status",
  "amount",
  "currency",
  "stripe_connected_account_id",
  "stripe_checkout_session_id",
  "stripe_payment_intent_id",
  "completed_at",
  "created_at",
  "updated_at"
)
SELECT
  "order"."organization_id",
  "order"."id",
  'STRIPE_CHECKOUT',
  'SUCCEEDED',
  "order"."payment_amount",
  "order"."payment_currency",
  "order"."stripe_connected_account_id",
  "order"."stripe_checkout_session_id",
  "order"."stripe_payment_intent_id",
  COALESCE("order"."paid_at", "order"."created_at"),
  "order"."created_at",
  "order"."updated_at"
FROM "orders" AS "order"
WHERE "order"."payment_amount" IS NOT NULL
  AND "order"."payment_currency" IS NOT NULL
  AND "order"."stripe_connected_account_id" IS NOT NULL
  AND (
    "order"."stripe_checkout_session_id" IS NOT NULL
    OR "order"."stripe_payment_intent_id" IS NOT NULL
  )
  AND "order"."payment_status" IN (
    'PAID',
    'REFUND_PENDING',
    'PARTIALLY_REFUNDED',
    'REFUND_FAILED',
    'REFUNDED'
  )
  AND NOT EXISTS (
    SELECT 1
    FROM "order_payments" AS "payment"
    WHERE "payment"."order_id" = "order"."id"
      AND "payment"."organization_id" = "order"."organization_id"
      AND "payment"."status" = 'SUCCEEDED'
  );

UPDATE "order_refunds" AS "refund"
SET "order_payment_id" = (
  SELECT "payment"."id"
  FROM "order_payments" AS "payment"
  WHERE "payment"."order_id" = "refund"."order_id"
    AND "payment"."organization_id" = "refund"."organization_id"
    AND "payment"."status" = 'SUCCEEDED'
    AND (
      ("refund"."provider" = 'CASH' AND "payment"."method" = 'CASH')
      OR
      ("refund"."provider" = 'STRIPE' AND "payment"."method" = 'STRIPE_CHECKOUT')
    )
  ORDER BY "payment"."completed_at" DESC NULLS LAST, "payment"."created_at" DESC
  LIMIT 1
)
WHERE "refund"."order_payment_id" IS NULL;

ALTER TABLE "orders"
  ADD CONSTRAINT "orders_payment_collected_amount_check"
  CHECK (
    "payment_collected_amount" >= 0
    AND (
      ("payment_amount" IS NULL AND "payment_collected_amount" = 0)
      OR
      (
        "payment_amount" IS NOT NULL
        AND "payment_collected_amount" <= "payment_amount"
      )
    )
  ),
  ADD CONSTRAINT "orders_cancellation_amounts_check"
  CHECK (
    (
      "cancellation_fee_amount" IS NULL
      AND "refund_amount" IS NULL
    )
    OR (
      "cancellation_fee_amount" IS NOT NULL
      AND "cancellation_fee_amount" >= 0
      AND "refund_amount" IS NOT NULL
      AND "refund_amount" >= 0
      AND "cancellation_fee_amount" + "refund_amount" = "payment_collected_amount"
    )
  );

CREATE INDEX "order_refunds_payment_idx"
  ON "order_refunds" USING btree ("order_payment_id");

CREATE UNIQUE INDEX "order_refunds_one_pending_per_payment_unique"
  ON "order_refunds" USING btree ("cancellation_id", "order_payment_id")
  WHERE "status" = 'PENDING';
