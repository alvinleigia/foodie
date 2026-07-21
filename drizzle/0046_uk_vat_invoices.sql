CREATE TYPE "vat_invoice_type" AS ENUM ('SIMPLIFIED', 'FULL');

DROP TRIGGER IF EXISTS "orders_financial_document_numbers_immutable" ON "orders";
DROP FUNCTION IF EXISTS "prevent_issued_financial_document_update"();

ALTER TABLE "orders"
  DROP CONSTRAINT "orders_invoice_issuance_check",
  ADD COLUMN "vat_invoice_type" "vat_invoice_type",
  ADD COLUMN "invoice_tax_point_at" timestamp,
  ADD COLUMN "invoice_supplier_name" text,
  ADD COLUMN "invoice_supplier_address_line_1" text,
  ADD COLUMN "invoice_supplier_address_line_2" text,
  ADD COLUMN "invoice_supplier_city" text,
  ADD COLUMN "invoice_supplier_region" text,
  ADD COLUMN "invoice_supplier_postal_code" text,
  ADD COLUMN "invoice_supplier_country_code" text,
  ADD COLUMN "invoice_supplier_vat_number" text,
  ADD COLUMN "invoice_customer_name" text,
  ADD COLUMN "invoice_customer_address_line_1" text,
  ADD COLUMN "invoice_customer_address_line_2" text,
  ADD COLUMN "invoice_customer_city" text,
  ADD COLUMN "invoice_customer_region" text,
  ADD COLUMN "invoice_customer_postal_code" text,
  ADD COLUMN "invoice_customer_country_code" text;

UPDATE "orders"
SET
  "invoice_number" = NULL,
  "invoice_issued_at" = NULL;

UPDATE "restaurant_document_counters"
SET "last_number" = coalesce((
  SELECT max("orders"."invoice_number")
  FROM "orders"
  WHERE "orders"."organization_id" = "restaurant_document_counters"."organization_id"
), 0),
"updated_at" = now()
WHERE "document_type" = 'INVOICE';

ALTER TABLE "orders"
  ADD CONSTRAINT "orders_invoice_issuance_check"
    CHECK (
      (
        "invoice_number" IS NULL
        AND "invoice_issued_at" IS NULL
        AND "vat_invoice_type" IS NULL
        AND "invoice_tax_point_at" IS NULL
        AND "invoice_supplier_name" IS NULL
        AND "invoice_supplier_address_line_1" IS NULL
        AND "invoice_supplier_address_line_2" IS NULL
        AND "invoice_supplier_city" IS NULL
        AND "invoice_supplier_region" IS NULL
        AND "invoice_supplier_postal_code" IS NULL
        AND "invoice_supplier_country_code" IS NULL
        AND "invoice_supplier_vat_number" IS NULL
        AND "invoice_customer_name" IS NULL
        AND "invoice_customer_address_line_1" IS NULL
        AND "invoice_customer_address_line_2" IS NULL
        AND "invoice_customer_city" IS NULL
        AND "invoice_customer_region" IS NULL
        AND "invoice_customer_postal_code" IS NULL
        AND "invoice_customer_country_code" IS NULL
      )
      OR (
        "invoice_number" > 0
        AND "invoice_issued_at" IS NOT NULL
        AND "vat_invoice_type" IS NOT NULL
        AND "invoice_tax_point_at" IS NOT NULL
        AND NULLIF(BTRIM("invoice_supplier_name"), '') IS NOT NULL
        AND NULLIF(BTRIM("invoice_supplier_address_line_1"), '') IS NOT NULL
        AND NULLIF(BTRIM("invoice_supplier_city"), '') IS NOT NULL
        AND NULLIF(BTRIM("invoice_supplier_postal_code"), '') IS NOT NULL
        AND "invoice_supplier_country_code" ~ '^[A-Z]{2}$'
        AND NULLIF(BTRIM("invoice_supplier_vat_number"), '') IS NOT NULL
        AND (
          "vat_invoice_type" = 'SIMPLIFIED'
          OR (
            NULLIF(BTRIM("invoice_customer_name"), '') IS NOT NULL
            AND NULLIF(BTRIM("invoice_customer_address_line_1"), '') IS NOT NULL
            AND NULLIF(BTRIM("invoice_customer_city"), '') IS NOT NULL
            AND NULLIF(BTRIM("invoice_customer_postal_code"), '') IS NOT NULL
            AND "invoice_customer_country_code" ~ '^[A-Z]{2}$'
          )
        )
      )
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
    NEW."invoice_issued_at",
    NEW."vat_invoice_type",
    NEW."invoice_tax_point_at",
    NEW."invoice_supplier_name",
    NEW."invoice_supplier_address_line_1",
    NEW."invoice_supplier_address_line_2",
    NEW."invoice_supplier_city",
    NEW."invoice_supplier_region",
    NEW."invoice_supplier_postal_code",
    NEW."invoice_supplier_country_code",
    NEW."invoice_supplier_vat_number",
    NEW."invoice_customer_name",
    NEW."invoice_customer_address_line_1",
    NEW."invoice_customer_address_line_2",
    NEW."invoice_customer_city",
    NEW."invoice_customer_region",
    NEW."invoice_customer_postal_code",
    NEW."invoice_customer_country_code"
  ) IS DISTINCT FROM ROW(
    OLD."invoice_number",
    OLD."invoice_issued_at",
    OLD."vat_invoice_type",
    OLD."invoice_tax_point_at",
    OLD."invoice_supplier_name",
    OLD."invoice_supplier_address_line_1",
    OLD."invoice_supplier_address_line_2",
    OLD."invoice_supplier_city",
    OLD."invoice_supplier_region",
    OLD."invoice_supplier_postal_code",
    OLD."invoice_supplier_country_code",
    OLD."invoice_supplier_vat_number",
    OLD."invoice_customer_name",
    OLD."invoice_customer_address_line_1",
    OLD."invoice_customer_address_line_2",
    OLD."invoice_customer_city",
    OLD."invoice_customer_region",
    OLD."invoice_customer_postal_code",
    OLD."invoice_customer_country_code"
  ) THEN
    RAISE EXCEPTION 'Issued VAT invoices cannot be changed.';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER "orders_financial_document_numbers_immutable"
BEFORE UPDATE OF
  "receipt_number",
  "receipt_issued_at",
  "invoice_number",
  "invoice_issued_at",
  "vat_invoice_type",
  "invoice_tax_point_at",
  "invoice_supplier_name",
  "invoice_supplier_address_line_1",
  "invoice_supplier_address_line_2",
  "invoice_supplier_city",
  "invoice_supplier_region",
  "invoice_supplier_postal_code",
  "invoice_supplier_country_code",
  "invoice_supplier_vat_number",
  "invoice_customer_name",
  "invoice_customer_address_line_1",
  "invoice_customer_address_line_2",
  "invoice_customer_city",
  "invoice_customer_region",
  "invoice_customer_postal_code",
  "invoice_customer_country_code"
ON "orders"
FOR EACH ROW
EXECUTE FUNCTION "prevent_issued_financial_document_update"();
