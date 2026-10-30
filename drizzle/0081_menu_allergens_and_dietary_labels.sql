ALTER TABLE "menu_tags"
  ADD COLUMN IF NOT EXISTS "kind" text DEFAULT 'ATTRIBUTE' NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'menu_tags_kind_check'
  ) THEN
    ALTER TABLE "menu_tags"
      ADD CONSTRAINT "menu_tags_kind_check"
      CHECK ("kind" IN ('DIETARY', 'ATTRIBUTE', 'LEGACY_ALLERGEN'));
  END IF;
END $$;

UPDATE "menu_tags"
SET "kind" = CASE
  WHEN "slug" IN ('veg', 'non-veg', 'vegan', 'gluten-free') THEN 'DIETARY'
  WHEN "slug" IN ('egg', 'contains-dairy', 'contains-nuts') THEN 'LEGACY_ALLERGEN'
  ELSE 'ATTRIBUTE'
END,
"updated_at" = now();

CREATE TABLE IF NOT EXISTS "menu_allergens" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "code" text NOT NULL,
  "name" text NOT NULL,
  "description" text,
  "sort_order" integer DEFAULT 0 NOT NULL,
  "is_active" boolean DEFAULT true NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "menu_allergens_code_check"
    CHECK ("code" ~ '^[A-Z][A-Z0-9_]*$')
);

CREATE UNIQUE INDEX IF NOT EXISTS "menu_allergens_code_unique"
  ON "menu_allergens" ("code");

CREATE INDEX IF NOT EXISTS "menu_allergens_active_idx"
  ON "menu_allergens" ("is_active", "sort_order");

CREATE TABLE IF NOT EXISTS "menu_item_allergens" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "organization_id" uuid NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
  "menu_item_id" uuid NOT NULL REFERENCES "menu_items"("id") ON DELETE CASCADE,
  "allergen_id" uuid NOT NULL REFERENCES "menu_allergens"("id") ON DELETE RESTRICT,
  "declaration" text DEFAULT 'CONTAINS' NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "menu_item_allergens_item_org_fk"
    FOREIGN KEY ("menu_item_id", "organization_id")
    REFERENCES "menu_items"("id", "organization_id") ON DELETE CASCADE,
  CONSTRAINT "menu_item_allergens_declaration_check"
    CHECK ("declaration" IN ('CONTAINS', 'MAY_CONTAIN'))
);

CREATE UNIQUE INDEX IF NOT EXISTS "menu_item_allergens_item_allergen_unique"
  ON "menu_item_allergens" ("menu_item_id", "allergen_id");

CREATE INDEX IF NOT EXISTS "menu_item_allergens_org_item_idx"
  ON "menu_item_allergens" ("organization_id", "menu_item_id");

INSERT INTO "menu_allergens" (
  "code", "name", "description", "sort_order", "is_active", "updated_at"
)
VALUES
  ('CELERY', 'Celery', 'Celery and celeriac.', 10, true, now()),
  ('GLUTEN_CEREALS', 'Cereals containing gluten', 'Wheat, rye, barley, oats and their hybridised strains.', 20, true, now()),
  ('CRUSTACEANS', 'Crustaceans', 'Prawns, crabs, lobster and crayfish.', 30, true, now()),
  ('EGGS', 'Eggs', 'Egg and products containing egg.', 40, true, now()),
  ('FISH', 'Fish', 'Fish and products containing fish.', 50, true, now()),
  ('LUPIN', 'Lupin', 'Lupin and products containing lupin.', 60, true, now()),
  ('MILK', 'Milk', 'Milk and dairy products.', 70, true, now()),
  ('MOLLUSCS', 'Molluscs', 'Mussels, oysters, squid and other molluscs.', 80, true, now()),
  ('MUSTARD', 'Mustard', 'Mustard and products containing mustard.', 90, true, now()),
  ('PEANUTS', 'Peanuts', 'Peanuts and products containing peanuts.', 100, true, now()),
  ('SESAME', 'Sesame', 'Sesame seeds and products containing sesame.', 110, true, now()),
  ('SOYBEANS', 'Soybeans', 'Soya and products containing soya.', 120, true, now()),
  ('SULPHITES', 'Sulphur dioxide and sulphites', 'Sulphur dioxide and sulphites above the regulated threshold.', 130, true, now()),
  ('TREE_NUTS', 'Tree nuts', 'Almonds, hazelnuts, walnuts, cashews and other regulated tree nuts.', 140, true, now())
ON CONFLICT ("code") DO UPDATE SET
  "name" = EXCLUDED."name",
  "description" = EXCLUDED."description",
  "sort_order" = EXCLUDED."sort_order",
  "is_active" = true,
  "updated_at" = now();

INSERT INTO "menu_item_allergens" (
  "organization_id", "menu_item_id", "allergen_id", "declaration", "updated_at"
)
SELECT
  item."organization_id",
  item."id",
  allergen."id",
  'CONTAINS',
  now()
FROM "menu_item_tags" item_tag
JOIN "menu_items" item ON item."id" = item_tag."menu_item_id"
JOIN "menu_tags" tag ON tag."id" = item_tag."tag_id"
JOIN "menu_allergens" allergen ON allergen."code" = CASE tag."slug"
  WHEN 'egg' THEN 'EGGS'
  WHEN 'contains-dairy' THEN 'MILK'
  WHEN 'contains-nuts' THEN 'TREE_NUTS'
END
WHERE tag."slug" IN ('egg', 'contains-dairy', 'contains-nuts')
ON CONFLICT ("menu_item_id", "allergen_id") DO NOTHING;
