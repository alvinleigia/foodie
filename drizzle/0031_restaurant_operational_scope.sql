ALTER TABLE "menu_categories"
  ALTER COLUMN "location_id" DROP NOT NULL;
ALTER TABLE "menu_items"
  ALTER COLUMN "location_id" DROP NOT NULL;
ALTER TABLE "modifier_groups"
  ALTER COLUMN "location_id" DROP NOT NULL;
ALTER TABLE "modifier_options"
  ALTER COLUMN "location_id" DROP NOT NULL;
ALTER TABLE "inventory_items"
  ALTER COLUMN "location_id" DROP NOT NULL;
ALTER TABLE "orders"
  ALTER COLUMN "location_id" DROP NOT NULL;
ALTER TABLE "order_items"
  ALTER COLUMN "location_id" DROP NOT NULL;
ALTER TABLE "order_item_modifiers"
  ALTER COLUMN "location_id" DROP NOT NULL;

DROP INDEX IF EXISTS "modifier_groups_tenant_slug_unique";
CREATE UNIQUE INDEX "modifier_groups_org_slug_unique"
  ON "modifier_groups" USING btree ("organization_id", "slug");

DROP INDEX IF EXISTS "inventory_items_menu_item_unique";
CREATE UNIQUE INDEX "inventory_items_org_menu_item_unique"
  ON "inventory_items" USING btree ("organization_id", "menu_item_id");

DROP INDEX IF EXISTS "orders_tenant_status_created_idx";
CREATE INDEX "orders_restaurant_status_created_idx"
  ON "orders" USING btree ("organization_id", "status", "created_at");

DROP INDEX IF EXISTS "orders_location_order_date_no_unique";
CREATE UNIQUE INDEX "orders_restaurant_order_date_no_unique"
  ON "orders" USING btree ("organization_id", "order_date", "order_no");

DROP INDEX IF EXISTS "order_items_tenant_order_idx";
CREATE INDEX "order_items_restaurant_order_idx"
  ON "order_items" USING btree ("organization_id", "order_id");

CREATE INDEX "menu_categories_organization_idx"
  ON "menu_categories" USING btree ("organization_id");
CREATE INDEX "menu_items_organization_idx"
  ON "menu_items" USING btree ("organization_id");

ALTER TABLE "menu_categories"
  DROP CONSTRAINT IF EXISTS "menu_categories_slug_unique";
ALTER TABLE "menu_items"
  DROP CONSTRAINT IF EXISTS "menu_items_slug_unique";
CREATE UNIQUE INDEX "menu_categories_org_slug_unique"
  ON "menu_categories" USING btree ("organization_id", "slug");
CREATE UNIQUE INDEX "menu_items_org_slug_unique"
  ON "menu_items" USING btree ("organization_id", "slug");
