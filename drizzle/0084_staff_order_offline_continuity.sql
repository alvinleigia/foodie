ALTER TABLE "orders"
  ADD COLUMN IF NOT EXISTS "client_request_id" text;

CREATE UNIQUE INDEX IF NOT EXISTS "orders_organization_client_request_unique"
  ON "orders" ("organization_id", "client_request_id")
  WHERE "client_request_id" IS NOT NULL;

ALTER TABLE "orders"
  DROP CONSTRAINT IF EXISTS "orders_client_request_id_check";

ALTER TABLE "orders"
  ADD CONSTRAINT "orders_client_request_id_check"
  CHECK (
    "client_request_id" IS NULL
    OR "client_request_id" ~ '^[0-9a-fA-F-]{36}$'
  );
