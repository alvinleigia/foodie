DROP INDEX IF EXISTS "organizations_slug_unique";

CREATE UNIQUE INDEX IF NOT EXISTS "organizations_type_slug_unique"
  ON "organizations" ("type", "slug");
