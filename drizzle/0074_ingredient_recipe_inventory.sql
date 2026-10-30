CREATE TABLE "inventory_ingredients" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "organization_id" uuid NOT NULL REFERENCES "organizations" ("id") ON DELETE CASCADE,
  "name" text NOT NULL,
  "unit" text NOT NULL,
  "current_quantity" numeric(14, 3) DEFAULT 0 NOT NULL,
  "low_stock_threshold" numeric(14, 3) DEFAULT 0 NOT NULL,
  "notes" text,
  "is_active" boolean DEFAULT true NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "inventory_ingredients_name_check"
    CHECK (char_length(btrim("name")) BETWEEN 1 AND 120),
  CONSTRAINT "inventory_ingredients_unit_check"
    CHECK (char_length(btrim("unit")) BETWEEN 1 AND 24),
  CONSTRAINT "inventory_ingredients_quantities_check"
    CHECK ("current_quantity" >= 0 AND "low_stock_threshold" >= 0)
);

CREATE UNIQUE INDEX "inventory_ingredients_id_organization_unique"
  ON "inventory_ingredients" ("id", "organization_id");

CREATE UNIQUE INDEX "inventory_ingredients_organization_name_unique"
  ON "inventory_ingredients" ("organization_id", lower("name"));

CREATE INDEX "inventory_ingredients_organization_active_idx"
  ON "inventory_ingredients" ("organization_id", "is_active", "name");

CREATE TABLE "menu_item_ingredients" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "organization_id" uuid NOT NULL REFERENCES "organizations" ("id") ON DELETE CASCADE,
  "menu_item_id" uuid NOT NULL,
  "ingredient_id" uuid NOT NULL,
  "quantity" numeric(14, 3) NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "menu_item_ingredients_item_organization_fk"
    FOREIGN KEY ("menu_item_id", "organization_id")
    REFERENCES "menu_items" ("id", "organization_id")
    ON DELETE CASCADE,
  CONSTRAINT "menu_item_ingredients_ingredient_organization_fk"
    FOREIGN KEY ("ingredient_id", "organization_id")
    REFERENCES "inventory_ingredients" ("id", "organization_id")
    ON DELETE RESTRICT,
  CONSTRAINT "menu_item_ingredients_quantity_check" CHECK ("quantity" > 0)
);

CREATE UNIQUE INDEX "menu_item_ingredients_item_ingredient_unique"
  ON "menu_item_ingredients" ("menu_item_id", "ingredient_id");

CREATE INDEX "menu_item_ingredients_organization_item_idx"
  ON "menu_item_ingredients" ("organization_id", "menu_item_id");

CREATE INDEX "menu_item_ingredients_ingredient_idx"
  ON "menu_item_ingredients" ("ingredient_id");
