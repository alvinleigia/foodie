CREATE TABLE IF NOT EXISTS "restaurant_charge_settings" (
  "organization_id" uuid PRIMARY KEY REFERENCES "organizations"("id") ON DELETE CASCADE,
  "service_charge_enabled" boolean DEFAULT false NOT NULL,
  "service_charge_rate_bps" integer DEFAULT 0 NOT NULL,
  "service_charge_dine_in" boolean DEFAULT true NOT NULL,
  "service_charge_pickup" boolean DEFAULT false NOT NULL,
  "service_charge_delivery" boolean DEFAULT false NOT NULL,
  "tips_enabled" boolean DEFAULT false NOT NULL,
  "tip_preset_1_bps" integer DEFAULT 1000 NOT NULL,
  "tip_preset_2_bps" integer DEFAULT 1250 NOT NULL,
  "tip_preset_3_bps" integer DEFAULT 1500 NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "restaurant_charge_settings_service_rate_check"
    CHECK ("service_charge_rate_bps" BETWEEN 0 AND 5000),
  CONSTRAINT "restaurant_charge_settings_tip_presets_check"
    CHECK (
      "tip_preset_1_bps" BETWEEN 1 AND 5000
      AND "tip_preset_2_bps" BETWEEN 1 AND 5000
      AND "tip_preset_3_bps" BETWEEN 1 AND 5000
      AND "tip_preset_1_bps" < "tip_preset_2_bps"
      AND "tip_preset_2_bps" < "tip_preset_3_bps"
    )
);

ALTER TABLE "orders"
  ADD COLUMN IF NOT EXISTS "service_charge_rate_bps_snapshot" integer DEFAULT 0 NOT NULL,
  ADD COLUMN IF NOT EXISTS "tips_enabled_snapshot" boolean DEFAULT false NOT NULL;

ALTER TABLE "orders"
  DROP CONSTRAINT IF EXISTS "orders_service_charge_rate_bps_snapshot_check";

ALTER TABLE "orders"
  ADD CONSTRAINT "orders_service_charge_rate_bps_snapshot_check"
  CHECK ("service_charge_rate_bps_snapshot" BETWEEN 0 AND 5000);
