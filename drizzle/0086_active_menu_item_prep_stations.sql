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

UPDATE "prep_stations" AS "station"
SET
  "is_active" = true,
  "updated_at" = now()
WHERE
  "station"."slug" = 'kitchen'
  AND "station"."is_active" = false
  AND EXISTS (
    SELECT 1
    FROM "menu_items" AS "item"
    WHERE
      "item"."organization_id" = "station"."organization_id"
      AND "item"."is_active" = true
      AND "item"."prep_station_id" IS NULL
  );

UPDATE "menu_items" AS "item"
SET
  "prep_station_id" = "station"."id",
  "updated_at" = now()
FROM "prep_stations" AS "station"
WHERE
  "item"."organization_id" = "station"."organization_id"
  AND "item"."is_active" = true
  AND "item"."prep_station_id" IS NULL
  AND "station"."slug" = 'kitchen'
  AND "station"."is_active" = true;

ALTER TABLE "menu_items"
ADD CONSTRAINT "menu_items_active_prep_station_check"
CHECK (NOT "is_active" OR "prep_station_id" IS NOT NULL);
