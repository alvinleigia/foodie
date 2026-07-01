CREATE TABLE IF NOT EXISTS "menu_tags" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "slug" text NOT NULL,
  "name" text NOT NULL,
  "description" text,
  "color" text DEFAULT 'stone' NOT NULL,
  "sort_order" integer DEFAULT 0 NOT NULL,
  "is_active" boolean DEFAULT true NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS "menu_tags_slug_unique"
  ON "menu_tags" ("slug");

CREATE INDEX IF NOT EXISTS "menu_tags_active_idx"
  ON "menu_tags" ("is_active");

CREATE TABLE IF NOT EXISTS "menu_item_tags" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "menu_item_id" uuid NOT NULL REFERENCES "menu_items"("id") ON DELETE CASCADE,
  "tag_id" uuid NOT NULL REFERENCES "menu_tags"("id") ON DELETE CASCADE,
  "created_at" timestamp DEFAULT now() NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS "menu_item_tags_item_tag_unique"
  ON "menu_item_tags" ("menu_item_id", "tag_id");

CREATE INDEX IF NOT EXISTS "menu_item_tags_item_idx"
  ON "menu_item_tags" ("menu_item_id");

CREATE INDEX IF NOT EXISTS "menu_item_tags_tag_idx"
  ON "menu_item_tags" ("tag_id");

INSERT INTO "menu_tags" (
  "slug",
  "name",
  "description",
  "color",
  "sort_order",
  "is_active",
  "updated_at"
)
VALUES
  ('veg', 'Veg', 'Vegetarian item.', 'green', 10, true, now()),
  ('non-veg', 'Non-Veg', 'Contains meat, poultry, fish or seafood.', 'red', 20, true, now()),
  ('egg', 'Egg', 'Contains egg.', 'amber', 30, true, now()),
  ('vegan', 'Vegan', 'Contains no animal-derived ingredients.', 'emerald', 40, true, now()),
  ('contains-dairy', 'Contains Dairy', 'Contains milk or dairy products.', 'sky', 50, true, now()),
  ('contains-nuts', 'Contains Nuts', 'Contains nuts or nut-based ingredients.', 'orange', 60, true, now()),
  ('spicy', 'Spicy', 'Has noticeable chilli or spice heat.', 'rose', 70, true, now()),
  ('gluten-free', 'Gluten Free', 'Prepared without gluten-containing ingredients.', 'blue', 80, true, now()),
  ('alcoholic', 'Alcoholic', 'Contains alcohol.', 'violet', 90, true, now())
ON CONFLICT ("slug") DO UPDATE SET
  "name" = EXCLUDED."name",
  "description" = EXCLUDED."description",
  "color" = EXCLUDED."color",
  "sort_order" = EXCLUDED."sort_order",
  "is_active" = true,
  "updated_at" = now();
