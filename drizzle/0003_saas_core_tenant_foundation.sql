DO $$ BEGIN
 CREATE TYPE "public"."organization_type" AS ENUM('PLATFORM', 'COMPANY', 'RESTAURANT');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
 CREATE TYPE "public"."membership_role" AS ENUM(
  'PLATFORM_ADMIN',
  'COMPANY_OWNER',
  'COMPANY_MANAGER',
  'RESTAURANT_MANAGER',
  'ORDER_OPERATOR'
 );
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

CREATE TABLE IF NOT EXISTS "organizations" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "parent_organization_id" uuid,
  "type" "organization_type" NOT NULL,
  "slug" text NOT NULL,
  "name" text NOT NULL,
  "logo_url" text,
  "timezone" text DEFAULT 'Asia/Calcutta' NOT NULL,
  "currency" text DEFAULT 'INR' NOT NULL,
  "is_active" boolean DEFAULT true NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);

DO $$ BEGIN
 ALTER TABLE "organizations"
  ADD CONSTRAINT "organizations_parent_organization_id_organizations_id_fk"
  FOREIGN KEY ("parent_organization_id") REFERENCES "public"."organizations"("id")
  ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

CREATE TABLE IF NOT EXISTS "locations" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "organization_id" uuid NOT NULL,
  "slug" text NOT NULL,
  "name" text NOT NULL,
  "label" text,
  "timezone" text DEFAULT 'Asia/Calcutta' NOT NULL,
  "is_active" boolean DEFAULT true NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);

DO $$ BEGIN
 ALTER TABLE "locations"
  ADD CONSTRAINT "locations_organization_id_organizations_id_fk"
  FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id")
  ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

CREATE TABLE IF NOT EXISTS "memberships" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL,
  "organization_id" uuid NOT NULL,
  "location_id" uuid,
  "role" "membership_role" NOT NULL,
  "is_active" boolean DEFAULT true NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);

DO $$ BEGIN
 ALTER TABLE "memberships"
  ADD CONSTRAINT "memberships_user_id_users_id_fk"
  FOREIGN KEY ("user_id") REFERENCES "public"."users"("id")
  ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
 ALTER TABLE "memberships"
  ADD CONSTRAINT "memberships_organization_id_organizations_id_fk"
  FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id")
  ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
 ALTER TABLE "memberships"
  ADD CONSTRAINT "memberships_location_id_locations_id_fk"
  FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id")
  ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

INSERT INTO "organizations" (
  "id",
  "parent_organization_id",
  "type",
  "slug",
  "name",
  "timezone",
  "currency",
  "is_active",
  "updated_at"
)
VALUES (
  '00000000-0000-0000-0000-000000000000',
  null,
  'PLATFORM',
  'foodie-platform',
  'Foodie Platform',
  'Asia/Calcutta',
  'INR',
  true,
  now()
)
ON CONFLICT ("id") DO NOTHING;

ALTER TABLE "menu_categories"
  ADD COLUMN IF NOT EXISTS "organization_id" uuid,
  ADD COLUMN IF NOT EXISTS "location_id" uuid;

ALTER TABLE "menu_items"
  ADD COLUMN IF NOT EXISTS "organization_id" uuid,
  ADD COLUMN IF NOT EXISTS "location_id" uuid;

ALTER TABLE "orders"
  ADD COLUMN IF NOT EXISTS "organization_id" uuid,
  ADD COLUMN IF NOT EXISTS "location_id" uuid;

ALTER TABLE "order_items"
  ADD COLUMN IF NOT EXISTS "organization_id" uuid,
  ADD COLUMN IF NOT EXISTS "location_id" uuid;

UPDATE "menu_items" AS item
SET
  "organization_id" = COALESCE(item."organization_id", category."organization_id"),
  "location_id" = COALESCE(item."location_id", category."location_id"),
  "updated_at" = now()
FROM "menu_categories" AS category
WHERE item."category_id" = category."id"
  AND (item."organization_id" IS NULL OR item."location_id" IS NULL);

UPDATE "order_items" AS item
SET
  "organization_id" = COALESCE(item."organization_id", parent."organization_id"),
  "location_id" = COALESCE(item."location_id", parent."location_id"),
  "updated_at" = now()
FROM "orders" AS parent
WHERE item."order_id" = parent."id"
  AND (item."organization_id" IS NULL OR item."location_id" IS NULL);

DELETE FROM "menu_items"
WHERE "organization_id" IS NULL OR "location_id" IS NULL;

DELETE FROM "menu_categories"
WHERE "organization_id" IS NULL OR "location_id" IS NULL;

DELETE FROM "order_items"
WHERE "organization_id" IS NULL OR "location_id" IS NULL;

DELETE FROM "orders"
WHERE "organization_id" IS NULL OR "location_id" IS NULL;

ALTER TABLE "menu_categories"
  ALTER COLUMN "organization_id" SET NOT NULL;

ALTER TABLE "menu_items"
  ALTER COLUMN "organization_id" SET NOT NULL;

ALTER TABLE "orders"
  ALTER COLUMN "organization_id" SET NOT NULL,
  ALTER COLUMN "location_id" SET NOT NULL;

ALTER TABLE "order_items"
  ALTER COLUMN "organization_id" SET NOT NULL,
  ALTER COLUMN "location_id" SET NOT NULL;

DO $$ BEGIN
 ALTER TABLE "menu_categories"
  ADD CONSTRAINT "menu_categories_organization_id_organizations_id_fk"
  FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id")
  ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
 ALTER TABLE "menu_categories"
  ADD CONSTRAINT "menu_categories_location_id_locations_id_fk"
  FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id")
  ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
 ALTER TABLE "menu_items"
  ADD CONSTRAINT "menu_items_organization_id_organizations_id_fk"
  FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id")
  ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
 ALTER TABLE "menu_items"
  ADD CONSTRAINT "menu_items_location_id_locations_id_fk"
  FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id")
  ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
 ALTER TABLE "orders"
  ADD CONSTRAINT "orders_organization_id_organizations_id_fk"
  FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id")
  ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
 ALTER TABLE "orders"
  ADD CONSTRAINT "orders_location_id_locations_id_fk"
  FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id")
  ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
 ALTER TABLE "order_items"
  ADD CONSTRAINT "order_items_organization_id_organizations_id_fk"
  FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id")
  ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
 ALTER TABLE "order_items"
  ADD CONSTRAINT "order_items_location_id_locations_id_fk"
  FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id")
  ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

CREATE INDEX IF NOT EXISTS "organizations_parent_idx"
  ON "organizations" ("parent_organization_id");

CREATE UNIQUE INDEX IF NOT EXISTS "organizations_slug_unique"
  ON "organizations" ("slug");

CREATE INDEX IF NOT EXISTS "locations_organization_idx"
  ON "locations" ("organization_id");

CREATE UNIQUE INDEX IF NOT EXISTS "locations_org_slug_unique"
  ON "locations" ("organization_id", "slug");

CREATE INDEX IF NOT EXISTS "memberships_organization_idx"
  ON "memberships" ("organization_id");

CREATE INDEX IF NOT EXISTS "memberships_location_idx"
  ON "memberships" ("location_id");

CREATE UNIQUE INDEX IF NOT EXISTS "memberships_user_org_location_unique"
  ON "memberships" (
    "user_id",
    "organization_id",
    COALESCE("location_id", '00000000-0000-0000-0000-000000000000'::uuid)
  );

CREATE INDEX IF NOT EXISTS "menu_categories_tenant_idx"
  ON "menu_categories" ("organization_id", "location_id");

CREATE INDEX IF NOT EXISTS "menu_items_tenant_idx"
  ON "menu_items" ("organization_id", "location_id");

CREATE INDEX IF NOT EXISTS "orders_tenant_status_created_idx"
  ON "orders" ("organization_id", "location_id", "status", "created_at");

CREATE INDEX IF NOT EXISTS "order_items_tenant_order_idx"
  ON "order_items" ("organization_id", "location_id", "order_id");
