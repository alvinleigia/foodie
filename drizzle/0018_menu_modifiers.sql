CREATE TYPE "public"."modifier_selection_type" AS ENUM ('SINGLE', 'MULTIPLE');

CREATE TABLE IF NOT EXISTS "modifier_groups" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "organization_id" uuid NOT NULL REFERENCES "organizations"("id") ON DELETE cascade,
  "location_id" uuid REFERENCES "locations"("id") ON DELETE cascade,
  "slug" text NOT NULL,
  "name" text NOT NULL,
  "description" text,
  "selection_type" "modifier_selection_type" DEFAULT 'MULTIPLE' NOT NULL,
  "is_required" boolean DEFAULT false NOT NULL,
  "min_selections" integer DEFAULT 0 NOT NULL,
  "max_selections" integer,
  "sort_order" integer DEFAULT 0 NOT NULL,
  "is_active" boolean DEFAULT true NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "modifier_options" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "organization_id" uuid NOT NULL REFERENCES "organizations"("id") ON DELETE cascade,
  "location_id" uuid REFERENCES "locations"("id") ON DELETE cascade,
  "group_id" uuid NOT NULL REFERENCES "modifier_groups"("id") ON DELETE cascade,
  "slug" text NOT NULL,
  "name" text NOT NULL,
  "price_delta" numeric(10, 2) DEFAULT '0' NOT NULL,
  "sort_order" integer DEFAULT 0 NOT NULL,
  "is_active" boolean DEFAULT true NOT NULL,
  "is_sold_out" boolean DEFAULT false NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "menu_item_modifier_groups" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "menu_item_id" uuid NOT NULL REFERENCES "menu_items"("id") ON DELETE cascade,
  "modifier_group_id" uuid NOT NULL REFERENCES "modifier_groups"("id") ON DELETE cascade,
  "sort_order" integer DEFAULT 0 NOT NULL,
  "is_active" boolean DEFAULT true NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "order_item_modifiers" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "organization_id" uuid NOT NULL REFERENCES "organizations"("id") ON DELETE cascade,
  "location_id" uuid NOT NULL REFERENCES "locations"("id") ON DELETE cascade,
  "order_item_id" uuid NOT NULL REFERENCES "order_items"("id") ON DELETE cascade,
  "modifier_group_id" text NOT NULL,
  "modifier_group_name" text NOT NULL,
  "modifier_id" text NOT NULL,
  "modifier_name" text NOT NULL,
  "quantity" integer DEFAULT 1 NOT NULL,
  "price_delta" numeric(10, 2) DEFAULT '0' NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "modifier_groups_organization_idx"
  ON "modifier_groups" ("organization_id");

CREATE INDEX IF NOT EXISTS "modifier_groups_location_idx"
  ON "modifier_groups" ("location_id");

CREATE UNIQUE INDEX IF NOT EXISTS "modifier_groups_tenant_slug_unique"
  ON "modifier_groups" ("organization_id", "location_id", "slug");

CREATE INDEX IF NOT EXISTS "modifier_options_group_idx"
  ON "modifier_options" ("group_id");

CREATE UNIQUE INDEX IF NOT EXISTS "modifier_options_group_slug_unique"
  ON "modifier_options" ("group_id", "slug");

CREATE UNIQUE INDEX IF NOT EXISTS "menu_item_modifier_groups_unique"
  ON "menu_item_modifier_groups" ("menu_item_id", "modifier_group_id");

CREATE INDEX IF NOT EXISTS "menu_item_modifier_groups_item_idx"
  ON "menu_item_modifier_groups" ("menu_item_id");

CREATE INDEX IF NOT EXISTS "menu_item_modifier_groups_group_idx"
  ON "menu_item_modifier_groups" ("modifier_group_id");

CREATE INDEX IF NOT EXISTS "order_item_modifiers_order_item_idx"
  ON "order_item_modifiers" ("order_item_id");

CREATE INDEX IF NOT EXISTS "order_item_modifiers_organization_idx"
  ON "order_item_modifiers" ("organization_id");

CREATE INDEX IF NOT EXISTS "order_item_modifiers_location_idx"
  ON "order_item_modifiers" ("location_id");
