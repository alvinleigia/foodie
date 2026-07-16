UPDATE "tenant_domains"
SET
  "purpose" = 'ORDERING',
  "updated_at" = now()
WHERE "scope" <> 'PLATFORM'
  AND "purpose" <> 'ORDERING';
