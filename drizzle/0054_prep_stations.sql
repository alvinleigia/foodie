CREATE TYPE "prep_station_type" AS ENUM ('KITCHEN', 'BAR', 'OTHER');

CREATE TABLE "prep_stations" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "organization_id" uuid NOT NULL,
  "slug" text NOT NULL,
  "name" text NOT NULL,
  "type" "prep_station_type" DEFAULT 'OTHER' NOT NULL,
  "sort_order" integer DEFAULT 0 NOT NULL,
  "is_active" boolean DEFAULT true NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "prep_stations_name_check"
    CHECK (char_length(btrim("name")) BETWEEN 1 AND 80),
  CONSTRAINT "prep_stations_slug_check"
    CHECK ("slug" ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$')
);

ALTER TABLE "prep_stations"
ADD CONSTRAINT "prep_stations_organization_id_organizations_id_fk"
FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id")
ON DELETE cascade ON UPDATE no action;

CREATE UNIQUE INDEX "prep_stations_id_organization_unique"
ON "prep_stations" ("id", "organization_id");

CREATE UNIQUE INDEX "prep_stations_organization_slug_unique"
ON "prep_stations" ("organization_id", "slug");

CREATE INDEX "prep_stations_organization_active_idx"
ON "prep_stations" ("organization_id", "is_active", "sort_order");

INSERT INTO "prep_stations" (
  "organization_id",
  "slug",
  "name",
  "type",
  "sort_order"
)
SELECT "id", 'kitchen', 'Kitchen', 'KITCHEN', 0
FROM "organizations"
WHERE "type" = 'RESTAURANT'
ON CONFLICT ("organization_id", "slug") DO NOTHING;

INSERT INTO "prep_stations" (
  "organization_id",
  "slug",
  "name",
  "type",
  "sort_order"
)
SELECT "id", 'bar', 'Bar', 'BAR', 1
FROM "organizations"
WHERE "type" = 'RESTAURANT'
ON CONFLICT ("organization_id", "slug") DO NOTHING;

ALTER TABLE "menu_items"
ADD COLUMN "prep_station_id" uuid;

ALTER TABLE "menu_items"
ADD CONSTRAINT "menu_items_prep_station_organization_fk"
FOREIGN KEY ("prep_station_id", "organization_id")
REFERENCES "public"."prep_stations"("id", "organization_id")
ON DELETE restrict ON UPDATE no action;

CREATE INDEX "menu_items_prep_station_idx"
ON "menu_items" ("organization_id", "prep_station_id");

ALTER TABLE "order_items"
ADD COLUMN "prep_station_id" uuid;

ALTER TABLE "order_items"
ADD COLUMN "prep_station_name_snapshot" text;

ALTER TABLE "order_items"
ADD CONSTRAINT "order_items_prep_station_organization_fk"
FOREIGN KEY ("prep_station_id", "organization_id")
REFERENCES "public"."prep_stations"("id", "organization_id")
ON DELETE restrict ON UPDATE no action;

ALTER TABLE "order_items"
ADD CONSTRAINT "order_items_prep_station_snapshot_check"
CHECK (
  ("prep_station_id" IS NULL AND "prep_station_name_snapshot" IS NULL)
  OR (
    "prep_station_id" IS NOT NULL
    AND char_length(btrim("prep_station_name_snapshot")) BETWEEN 1 AND 80
  )
);

CREATE INDEX "order_items_prep_station_status_idx"
ON "order_items" (
  "organization_id",
  "prep_station_id",
  "status",
  "created_at"
);
