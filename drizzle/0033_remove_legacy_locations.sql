WITH ranked_memberships AS (
  SELECT
    membership."id",
    row_number() OVER (
      PARTITION BY membership."user_id", membership."organization_id"
      ORDER BY
        membership."is_active" DESC,
        CASE membership."role"
          WHEN 'PLATFORM_ADMIN' THEN 1
          WHEN 'COMPANY_OWNER' THEN 2
          WHEN 'COMPANY_MANAGER' THEN 3
          WHEN 'RESTAURANT_MANAGER' THEN 4
          WHEN 'ORDER_OPERATOR' THEN 5
          ELSE 6
        END,
        membership."updated_at" DESC,
        membership."created_at",
        membership."id"
    ) AS membership_position
  FROM "memberships" membership
)
DELETE FROM "memberships" membership
USING ranked_memberships ranked
WHERE membership."id" = ranked."id"
  AND ranked."membership_position" > 1;

ALTER TABLE "tenant_domains"
  DROP CONSTRAINT IF EXISTS "tenant_domains_owner_scope_check";

DROP INDEX IF EXISTS "tenant_domains_scope_idx";
DROP INDEX IF EXISTS "tenant_domains_company_primary_unique";
DROP INDEX IF EXISTS "tenant_domains_restaurant_primary_unique";

DELETE FROM "tenant_domains" WHERE "scope" = 'LOCATION';

ALTER TABLE "tenant_domains" DROP COLUMN IF EXISTS "location_id";
ALTER TABLE "audit_logs" DROP COLUMN IF EXISTS "location_id";
ALTER TABLE "memberships" DROP COLUMN IF EXISTS "location_id";
ALTER TABLE "menu_categories" DROP COLUMN IF EXISTS "location_id";
ALTER TABLE "menu_items" DROP COLUMN IF EXISTS "location_id";
ALTER TABLE "modifier_groups" DROP COLUMN IF EXISTS "location_id";
ALTER TABLE "modifier_options" DROP COLUMN IF EXISTS "location_id";
ALTER TABLE "inventory_items" DROP COLUMN IF EXISTS "location_id";
ALTER TABLE "orders" DROP COLUMN IF EXISTS "location_id";
ALTER TABLE "order_items" DROP COLUMN IF EXISTS "location_id";
ALTER TABLE "order_item_modifiers" DROP COLUMN IF EXISTS "location_id";
ALTER TABLE "saas_plans" DROP COLUMN IF EXISTS "max_locations";

DROP TABLE IF EXISTS "locations";

CREATE TYPE "tenant_domain_scope_next" AS ENUM (
  'PLATFORM',
  'COMPANY',
  'RESTAURANT'
);

ALTER TABLE "tenant_domains"
  ALTER COLUMN "scope" TYPE "tenant_domain_scope_next"
  USING "scope"::text::"tenant_domain_scope_next";

DROP TYPE "tenant_domain_scope";
ALTER TYPE "tenant_domain_scope_next" RENAME TO "tenant_domain_scope";

CREATE INDEX "tenant_domains_scope_idx"
  ON "tenant_domains" USING btree ("scope");

CREATE UNIQUE INDEX "tenant_domains_company_primary_unique"
  ON "tenant_domains" USING btree ("company_organization_id")
  WHERE "scope" = 'COMPANY' AND "is_primary" = true;

CREATE UNIQUE INDEX "tenant_domains_restaurant_primary_unique"
  ON "tenant_domains" USING btree ("restaurant_organization_id")
  WHERE "scope" = 'RESTAURANT' AND "is_primary" = true;

CREATE UNIQUE INDEX "memberships_user_org_unique"
  ON "memberships" USING btree ("user_id", "organization_id");

ALTER TABLE "tenant_domains"
  ADD CONSTRAINT "tenant_domains_owner_scope_check"
  CHECK (
    (
      "scope" = 'PLATFORM'
      AND "company_organization_id" IS NULL
      AND "restaurant_organization_id" IS NULL
    )
    OR (
      "scope" = 'COMPANY'
      AND "company_organization_id" IS NOT NULL
      AND "restaurant_organization_id" IS NULL
      AND "purpose" = 'ORDERING'
    )
    OR (
      "scope" = 'RESTAURANT'
      AND "company_organization_id" IS NOT NULL
      AND "restaurant_organization_id" IS NOT NULL
      AND "purpose" = 'ORDERING'
    )
  );
