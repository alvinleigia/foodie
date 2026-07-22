ALTER TABLE "order_items"
  ADD COLUMN "tax_rate_bps_snapshot" integer DEFAULT 0 NOT NULL,
  ADD COLUMN "taxable_amount_snapshot" numeric(10, 2),
  ADD COLUMN "tax_amount_snapshot" numeric(10, 2);

UPDATE "order_items" AS item
SET "tax_rate_bps_snapshot" = orders."tax_rate_bps_snapshot"
FROM "orders" AS orders
WHERE orders."id" = item."order_id";

ALTER TABLE "order_items"
  ADD CONSTRAINT "order_items_tax_rate_bps_snapshot_check"
  CHECK ("tax_rate_bps_snapshot" >= 0 AND "tax_rate_bps_snapshot" <= 10000),
  ADD CONSTRAINT "order_items_tax_amount_snapshots_check"
  CHECK (
    ("taxable_amount_snapshot" IS NULL AND "tax_amount_snapshot" IS NULL)
    OR (
      "taxable_amount_snapshot" IS NOT NULL
      AND "taxable_amount_snapshot" >= 0
      AND "tax_amount_snapshot" IS NOT NULL
      AND "tax_amount_snapshot" >= 0
    )
  );
