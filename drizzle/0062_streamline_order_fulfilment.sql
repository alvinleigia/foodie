ALTER TYPE "order_fulfilment_type"
RENAME TO "order_fulfilment_type_legacy";

CREATE TYPE "order_fulfilment_type" AS ENUM (
  'DINE_IN',
  'PICKUP',
  'DELIVERY'
);

ALTER TABLE "orders"
ADD COLUMN "delivery_address_line_1" text,
ADD COLUMN "delivery_address_line_2" text,
ADD COLUMN "delivery_city" text,
ADD COLUMN "delivery_postal_code" text,
ADD COLUMN "delivery_instructions" text;

ALTER TABLE "orders"
ALTER COLUMN "fulfilment_type" DROP DEFAULT;

DROP INDEX "menu_item_fulfilment_taxes_item_type_def_unique";
DROP INDEX "menu_item_fulfilment_taxes_org_item_type_idx";

ALTER TABLE "orders"
ALTER COLUMN "fulfilment_type" TYPE "order_fulfilment_type"
USING (
  CASE "fulfilment_type"::text
    WHEN 'DINE_IN' THEN 'DINE_IN'::"order_fulfilment_type"
    WHEN 'DELIVERY' THEN 'DELIVERY'::"order_fulfilment_type"
    ELSE 'PICKUP'::"order_fulfilment_type"
  END
);

ALTER TABLE "menu_item_fulfilment_tax_assignments"
ALTER COLUMN "fulfilment_type" TYPE "order_fulfilment_type"
USING (
  CASE "fulfilment_type"::text
    WHEN 'DINE_IN' THEN 'DINE_IN'::"order_fulfilment_type"
    WHEN 'DELIVERY' THEN 'DELIVERY'::"order_fulfilment_type"
    ELSE 'PICKUP'::"order_fulfilment_type"
  END
);

WITH "duplicate_assignments" AS (
  SELECT
    "id",
    row_number() OVER (
      PARTITION BY "menu_item_id", "fulfilment_type", "tax_definition_id"
      ORDER BY "sort_order", "created_at", "id"
    ) AS "duplicate_position"
  FROM "menu_item_fulfilment_tax_assignments"
)
DELETE FROM "menu_item_fulfilment_tax_assignments"
WHERE "id" IN (
  SELECT "id"
  FROM "duplicate_assignments"
  WHERE "duplicate_position" > 1
);

CREATE UNIQUE INDEX "menu_item_fulfilment_taxes_item_type_def_unique"
ON "menu_item_fulfilment_tax_assignments" (
  "menu_item_id",
  "fulfilment_type",
  "tax_definition_id"
);

CREATE INDEX "menu_item_fulfilment_taxes_org_item_type_idx"
ON "menu_item_fulfilment_tax_assignments" (
  "organization_id",
  "menu_item_id",
  "fulfilment_type",
  "sort_order"
);

ALTER TABLE "orders"
ALTER COLUMN "fulfilment_type" SET DEFAULT 'PICKUP';

DROP TYPE "order_fulfilment_type_legacy";
