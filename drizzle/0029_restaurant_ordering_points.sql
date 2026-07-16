CREATE TYPE "ordering_point_type" AS ENUM (
  'GENERAL',
  'TABLE',
  'COUNTER'
);

CREATE TABLE "ordering_points" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "organization_id" uuid NOT NULL,
  "slug" text NOT NULL,
  "qr_slug" text,
  "name" text NOT NULL,
  "label" text,
  "type" "ordering_point_type" DEFAULT 'GENERAL' NOT NULL,
  "is_default" boolean DEFAULT false NOT NULL,
  "is_active" boolean DEFAULT true NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "ordering_points_organization_id_organizations_id_fk"
    FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id")
    ON DELETE cascade ON UPDATE no action
);

CREATE INDEX "ordering_points_organization_idx"
  ON "ordering_points" USING btree ("organization_id");
CREATE UNIQUE INDEX "ordering_points_org_slug_unique"
  ON "ordering_points" USING btree ("organization_id", "slug");
CREATE UNIQUE INDEX "ordering_points_qr_slug_unique"
  ON "ordering_points" USING btree ("qr_slug");
CREATE UNIQUE INDEX "ordering_points_org_default_unique"
  ON "ordering_points" USING btree ("organization_id")
  WHERE "is_default" = true;

INSERT INTO "ordering_points" (
  "id",
  "organization_id",
  "slug",
  "qr_slug",
  "name",
  "label",
  "type",
  "is_default",
  "is_active",
  "created_at",
  "updated_at"
)
SELECT
  location."id",
  location."organization_id",
  location."slug",
  location."qr_slug",
  location."name",
  location."label",
  'GENERAL'::"ordering_point_type",
  row_number() OVER (
    PARTITION BY location."organization_id"
    ORDER BY location."created_at", location."id"
  ) = 1,
  location."is_active",
  location."created_at",
  location."updated_at"
FROM "locations" location
INNER JOIN "organizations" organization
  ON organization."id" = location."organization_id"
WHERE organization."type" = 'RESTAURANT';

ALTER TABLE "orders"
  ADD COLUMN "ordering_point_id" uuid;

ALTER TABLE "orders"
  ADD CONSTRAINT "orders_ordering_point_id_ordering_points_id_fk"
  FOREIGN KEY ("ordering_point_id") REFERENCES "public"."ordering_points"("id")
  ON DELETE set null ON UPDATE no action;

UPDATE "orders" order_record
SET "ordering_point_id" = order_record."location_id"
WHERE EXISTS (
  SELECT 1
  FROM "ordering_points" ordering_point
  WHERE ordering_point."id" = order_record."location_id"
);

CREATE INDEX "orders_ordering_point_idx"
  ON "orders" USING btree ("ordering_point_id");
