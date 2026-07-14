CREATE TABLE IF NOT EXISTS "deployment_cells" (
  "id" integer PRIMARY KEY NOT NULL,
  "cell_id" text NOT NULL,
  "region" text NOT NULL,
  "root_domain" text NOT NULL,
  "default_locale" text NOT NULL,
  "default_timezone" text NOT NULL,
  "default_currency" text NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "deployment_cells_singleton_check" CHECK ("id" = 1)
);

CREATE UNIQUE INDEX IF NOT EXISTS "deployment_cells_cell_id_unique"
  ON "deployment_cells" ("cell_id");

ALTER TABLE "organizations"
  ALTER COLUMN "timezone" DROP DEFAULT,
  ALTER COLUMN "currency" DROP DEFAULT;

ALTER TABLE "locations"
  ALTER COLUMN "timezone" DROP DEFAULT;
