CREATE TYPE "tax_pricing_mode" AS ENUM ('INCLUSIVE', 'EXCLUSIVE');

ALTER TABLE "organization_tax_profiles"
  ADD COLUMN "pricing_mode" "tax_pricing_mode" DEFAULT 'INCLUSIVE' NOT NULL;

ALTER TABLE "organization_tax_profiles"
  ADD CONSTRAINT "organization_tax_profiles_none_pricing_mode_check"
  CHECK ("tax_system" <> 'NONE' OR "pricing_mode" = 'INCLUSIVE');

ALTER TABLE "orders"
  ADD COLUMN "tax_pricing_mode_snapshot" "tax_pricing_mode" DEFAULT 'INCLUSIVE' NOT NULL,
  ADD COLUMN "tax_rate_bps_snapshot" integer DEFAULT 0 NOT NULL;

ALTER TABLE "orders"
  ADD CONSTRAINT "orders_tax_rate_bps_snapshot_check"
  CHECK ("tax_rate_bps_snapshot" >= 0 AND "tax_rate_bps_snapshot" <= 10000);
