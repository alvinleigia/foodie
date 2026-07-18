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
ON CONFLICT ("id") DO UPDATE SET
  "type" = 'PLATFORM',
  "slug" = 'foodie-platform',
  "name" = 'Foodie Platform',
  "is_active" = true,
  "updated_at" = now();

DO $migration$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'memberships'
      AND column_name = 'location_id'
  ) THEN
    EXECUTE $sql$
      UPDATE "memberships"
      SET
        "organization_id" = '00000000-0000-0000-0000-000000000000',
        "location_id" = null,
        "role" = 'PLATFORM_ADMIN',
        "is_active" = true,
        "updated_at" = now()
      WHERE "role" = 'PLATFORM_ADMIN'
    $sql$;

    EXECUTE $sql$
      WITH ranked_memberships AS (
        SELECT
          "id",
          row_number() OVER (
            PARTITION BY
              "user_id",
              "organization_id",
              COALESCE(
                "location_id",
                '00000000-0000-0000-0000-000000000000'::uuid
              )
            ORDER BY
              "is_active" DESC,
              "updated_at" DESC,
              "created_at" DESC,
              "id" DESC
          ) AS duplicate_rank
        FROM "memberships"
      )
      DELETE FROM "memberships"
      WHERE "id" IN (
        SELECT "id"
        FROM ranked_memberships
        WHERE duplicate_rank > 1
      )
    $sql$;

    EXECUTE 'DROP INDEX IF EXISTS "memberships_user_org_location_unique"';

    EXECUTE $sql$
      CREATE UNIQUE INDEX IF NOT EXISTS "memberships_user_org_location_unique"
        ON "memberships" (
          "user_id",
          "organization_id",
          COALESCE(
            "location_id",
            '00000000-0000-0000-0000-000000000000'::uuid
          )
        )
    $sql$;
  END IF;

  IF to_regclass('public.locations') IS NOT NULL THEN
    EXECUTE $sql$
      DELETE FROM "locations"
      WHERE "id" = '00000000-0000-0000-0000-000000000003'
    $sql$;
  END IF;
END;
$migration$;

DELETE FROM "organizations"
WHERE "id" IN (
  '00000000-0000-0000-0000-000000000002',
  '00000000-0000-0000-0000-000000000001'
);
