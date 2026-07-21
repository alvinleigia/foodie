CREATE TYPE "financial_document_type" AS ENUM ('RECEIPT', 'INVOICE');

CREATE TABLE "restaurant_document_counters" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "organization_id" uuid NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
  "document_type" "financial_document_type" NOT NULL,
  "last_number" integer DEFAULT 0 NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "restaurant_document_counters_org_type_unique"
    UNIQUE ("organization_id", "document_type"),
  CONSTRAINT "restaurant_document_counters_last_number_check"
    CHECK ("last_number" >= 0)
);

ALTER TABLE "orders"
  ADD COLUMN "receipt_number" integer,
  ADD COLUMN "receipt_issued_at" timestamp,
  ADD COLUMN "invoice_number" integer,
  ADD COLUMN "invoice_issued_at" timestamp;

WITH "numbered_paid_orders" AS (
  SELECT
    "id",
    row_number() OVER (
      PARTITION BY "organization_id"
      ORDER BY coalesce("paid_at", "created_at"), "id"
    )::integer AS "document_number"
  FROM "orders"
  WHERE "payment_status" IN (
    'PAID',
    'REFUND_PENDING',
    'PARTIALLY_REFUNDED',
    'REFUND_FAILED',
    'REFUNDED'
  )
)
UPDATE "orders"
SET
  "receipt_number" = "numbered_paid_orders"."document_number",
  "receipt_issued_at" = coalesce("orders"."paid_at", "orders"."created_at"),
  "invoice_number" = "numbered_paid_orders"."document_number",
  "invoice_issued_at" = coalesce("orders"."paid_at", "orders"."created_at")
FROM "numbered_paid_orders"
WHERE "orders"."id" = "numbered_paid_orders"."id";

INSERT INTO "restaurant_document_counters" (
  "organization_id",
  "document_type",
  "last_number"
)
SELECT "organization_id", 'RECEIPT', max("receipt_number")
FROM "orders"
WHERE "receipt_number" IS NOT NULL
GROUP BY "organization_id";

INSERT INTO "restaurant_document_counters" (
  "organization_id",
  "document_type",
  "last_number"
)
SELECT "organization_id", 'INVOICE', max("invoice_number")
FROM "orders"
WHERE "invoice_number" IS NOT NULL
GROUP BY "organization_id";

CREATE UNIQUE INDEX "orders_restaurant_receipt_number_unique"
  ON "orders" ("organization_id", "receipt_number");

CREATE UNIQUE INDEX "orders_restaurant_invoice_number_unique"
  ON "orders" ("organization_id", "invoice_number");

ALTER TABLE "orders"
  ADD CONSTRAINT "orders_receipt_issuance_check"
    CHECK (
      ("receipt_number" IS NULL AND "receipt_issued_at" IS NULL)
      OR ("receipt_number" > 0 AND "receipt_issued_at" IS NOT NULL)
    ),
  ADD CONSTRAINT "orders_invoice_issuance_check"
    CHECK (
      ("invoice_number" IS NULL AND "invoice_issued_at" IS NULL)
      OR ("invoice_number" > 0 AND "invoice_issued_at" IS NOT NULL)
    );

CREATE FUNCTION "prevent_issued_financial_document_update"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF OLD."receipt_number" IS NOT NULL AND ROW(
    NEW."receipt_number",
    NEW."receipt_issued_at"
  ) IS DISTINCT FROM ROW(
    OLD."receipt_number",
    OLD."receipt_issued_at"
  ) THEN
    RAISE EXCEPTION 'Issued receipt numbers cannot be changed.';
  END IF;

  IF OLD."invoice_number" IS NOT NULL AND ROW(
    NEW."invoice_number",
    NEW."invoice_issued_at"
  ) IS DISTINCT FROM ROW(
    OLD."invoice_number",
    OLD."invoice_issued_at"
  ) THEN
    RAISE EXCEPTION 'Issued invoice numbers cannot be changed.';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER "orders_financial_document_numbers_immutable"
BEFORE UPDATE OF
  "receipt_number",
  "receipt_issued_at",
  "invoice_number",
  "invoice_issued_at"
ON "orders"
FOR EACH ROW
EXECUTE FUNCTION "prevent_issued_financial_document_update"();
