UPDATE "tenant_domains" AS "domain"
SET
  "scope" = 'RESTAURANT',
  "purpose" = 'ORDERING',
  "company_organization_id" = "restaurant"."parent_organization_id",
  "restaurant_organization_id" = "location"."organization_id",
  "location_id" = NULL,
  "updated_at" = now()
FROM "locations" AS "location"
INNER JOIN "organizations" AS "restaurant"
  ON "restaurant"."id" = "location"."organization_id"
WHERE "domain"."scope" = 'LOCATION'
  AND "domain"."location_id" = "location"."id";

UPDATE "tenant_domains" AS "domain"
SET
  "company_organization_id" = "restaurant"."parent_organization_id",
  "location_id" = NULL,
  "purpose" = 'ORDERING',
  "updated_at" = now()
FROM "organizations" AS "restaurant"
WHERE "domain"."scope" = 'RESTAURANT'
  AND "domain"."restaurant_organization_id" = "restaurant"."id";

UPDATE "tenant_domains"
SET
  "restaurant_organization_id" = NULL,
  "location_id" = NULL,
  "purpose" = 'ORDERING',
  "updated_at" = now()
WHERE "scope" = 'COMPANY';

UPDATE "tenant_domains"
SET
  "company_organization_id" = NULL,
  "restaurant_organization_id" = NULL,
  "location_id" = NULL,
  "updated_at" = now()
WHERE "scope" = 'PLATFORM';

DELETE FROM "tenant_domains"
WHERE "scope" = 'LOCATION'
   OR ("scope" = 'COMPANY' AND "company_organization_id" IS NULL)
   OR (
     "scope" = 'RESTAURANT'
     AND (
       "company_organization_id" IS NULL
       OR "restaurant_organization_id" IS NULL
     )
   );

DELETE FROM "tenant_domains" AS "domain"
WHERE "domain"."scope" = 'COMPANY'
  AND NOT EXISTS (
    SELECT 1
    FROM "organizations" AS "company"
    WHERE "company"."id" = "domain"."company_organization_id"
      AND "company"."type" = 'COMPANY'
  );

DELETE FROM "tenant_domains" AS "domain"
WHERE "domain"."scope" = 'RESTAURANT'
  AND NOT EXISTS (
    SELECT 1
    FROM "organizations" AS "restaurant"
    INNER JOIN "organizations" AS "company"
      ON "company"."id" = "restaurant"."parent_organization_id"
     AND "company"."type" = 'COMPANY'
    WHERE "restaurant"."id" = "domain"."restaurant_organization_id"
      AND "restaurant"."type" = 'RESTAURANT'
      AND "company"."id" = "domain"."company_organization_id"
  );

DELETE FROM "organization_email_settings" AS "settings"
USING "organizations" AS "organization"
WHERE "organization"."id" = "settings"."organization_id"
  AND "organization"."type" NOT IN ('COMPANY', 'RESTAURANT');

DELETE FROM "organization_payment_accounts" AS "settings"
USING "organizations" AS "organization"
WHERE "organization"."id" = "settings"."organization_id"
  AND "organization"."type" NOT IN ('COMPANY', 'RESTAURANT');

DELETE FROM "organization_oauth_settings" AS "settings"
USING "organizations" AS "organization"
WHERE "organization"."id" = "settings"."organization_id"
  AND "organization"."type" NOT IN ('COMPANY', 'RESTAURANT');

WITH "ranked_primary_domains" AS (
  SELECT
    "id",
    row_number() OVER (
      PARTITION BY "scope", "company_organization_id", "restaurant_organization_id"
      ORDER BY "created_at", "id"
    ) AS "primary_rank"
  FROM "tenant_domains"
  WHERE "is_primary" = true
    AND "scope" IN ('COMPANY', 'RESTAURANT')
)
UPDATE "tenant_domains" AS "domain"
SET
  "is_primary" = false,
  "updated_at" = now()
FROM "ranked_primary_domains" AS "ranked"
WHERE "domain"."id" = "ranked"."id"
  AND "ranked"."primary_rank" > 1;

DROP INDEX IF EXISTS "tenant_domains_location_idx";

CREATE UNIQUE INDEX "tenant_domains_company_primary_unique"
  ON "tenant_domains" USING btree ("company_organization_id")
  WHERE "scope" = 'COMPANY' AND "is_primary" = true;

CREATE UNIQUE INDEX "tenant_domains_restaurant_primary_unique"
  ON "tenant_domains" USING btree ("restaurant_organization_id")
  WHERE "scope" = 'RESTAURANT' AND "is_primary" = true;

ALTER TABLE "tenant_domains"
  ADD CONSTRAINT "tenant_domains_owner_scope_check"
  CHECK (
    (
      "scope" = 'PLATFORM'
      AND "company_organization_id" IS NULL
      AND "restaurant_organization_id" IS NULL
      AND "location_id" IS NULL
    )
    OR (
      "scope" = 'COMPANY'
      AND "company_organization_id" IS NOT NULL
      AND "restaurant_organization_id" IS NULL
      AND "location_id" IS NULL
      AND "purpose" = 'ORDERING'
    )
    OR (
      "scope" = 'RESTAURANT'
      AND "company_organization_id" IS NOT NULL
      AND "restaurant_organization_id" IS NOT NULL
      AND "location_id" IS NULL
      AND "purpose" = 'ORDERING'
    )
  );
