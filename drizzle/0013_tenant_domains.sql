DO $$
BEGIN
  CREATE TYPE "tenant_domain_scope" AS ENUM (
    'PLATFORM',
    'COMPANY',
    'RESTAURANT',
    'LOCATION'
  );
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$
BEGIN
  CREATE TYPE "tenant_domain_purpose" AS ENUM (
    'ADMIN',
    'ORDERING',
    'BOTH'
  );
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

CREATE TABLE IF NOT EXISTS "tenant_domains" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "domain" text NOT NULL,
  "scope" "tenant_domain_scope" NOT NULL,
  "purpose" "tenant_domain_purpose" DEFAULT 'BOTH' NOT NULL,
  "company_organization_id" uuid REFERENCES "organizations"("id") ON DELETE CASCADE,
  "restaurant_organization_id" uuid REFERENCES "organizations"("id") ON DELETE CASCADE,
  "location_id" uuid REFERENCES "locations"("id") ON DELETE CASCADE,
  "is_primary" boolean DEFAULT false NOT NULL,
  "is_active" boolean DEFAULT true NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS "tenant_domains_domain_unique"
  ON "tenant_domains" ("domain");

CREATE INDEX IF NOT EXISTS "tenant_domains_company_idx"
  ON "tenant_domains" ("company_organization_id");

CREATE INDEX IF NOT EXISTS "tenant_domains_restaurant_idx"
  ON "tenant_domains" ("restaurant_organization_id");

CREATE INDEX IF NOT EXISTS "tenant_domains_location_idx"
  ON "tenant_domains" ("location_id");

CREATE INDEX IF NOT EXISTS "tenant_domains_scope_idx"
  ON "tenant_domains" ("scope");

INSERT INTO "tenant_domains" (
  "domain",
  "scope",
  "purpose",
  "is_primary",
  "is_active",
  "updated_at"
)
VALUES (
  'foodie.leigia.com',
  'PLATFORM',
  'ADMIN',
  true,
  true,
  now()
)
ON CONFLICT ("domain") DO NOTHING;

INSERT INTO "tenant_domains" (
  "domain",
  "scope",
  "purpose",
  "company_organization_id",
  "is_primary",
  "is_active",
  "updated_at"
)
SELECT
  lower("slug") || '.foodie.leigia.com',
  'COMPANY',
  'BOTH',
  "id",
  true,
  true,
  now()
FROM "organizations"
WHERE "type" = 'COMPANY'
ON CONFLICT ("domain") DO NOTHING;
