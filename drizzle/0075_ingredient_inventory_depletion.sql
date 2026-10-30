ALTER TABLE "order_items"
  ADD COLUMN "ingredient_inventory_reserved_at" timestamp;

CREATE TABLE "order_item_ingredient_reservations" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "organization_id" uuid NOT NULL REFERENCES "organizations" ("id") ON DELETE CASCADE,
  "order_id" uuid NOT NULL REFERENCES "orders" ("id") ON DELETE CASCADE,
  "order_item_id" uuid NOT NULL,
  "ingredient_id" uuid NOT NULL,
  "ingredient_name_snapshot" text NOT NULL,
  "unit_snapshot" text NOT NULL,
  "quantity" numeric(14, 3) NOT NULL,
  "restored_at" timestamp,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "order_item_ingredient_reservations_item_order_org_fk"
    FOREIGN KEY ("order_item_id", "order_id", "organization_id")
    REFERENCES "order_items" ("id", "order_id", "organization_id")
    ON DELETE CASCADE,
  CONSTRAINT "order_item_ingredient_reservations_ingredient_org_fk"
    FOREIGN KEY ("ingredient_id", "organization_id")
    REFERENCES "inventory_ingredients" ("id", "organization_id")
    ON DELETE RESTRICT,
  CONSTRAINT "order_item_ingredient_reservations_quantity_check"
    CHECK ("quantity" > 0),
  CONSTRAINT "order_item_ingredient_reservations_snapshots_check"
    CHECK (
      char_length(btrim("ingredient_name_snapshot")) BETWEEN 1 AND 120
      AND char_length(btrim("unit_snapshot")) BETWEEN 1 AND 24
    )
);

CREATE UNIQUE INDEX "order_item_ingredient_reservations_item_ingredient_unique"
  ON "order_item_ingredient_reservations" ("order_item_id", "ingredient_id");

CREATE INDEX "order_item_ingredient_reservations_org_order_idx"
  ON "order_item_ingredient_reservations" ("organization_id", "order_id");
