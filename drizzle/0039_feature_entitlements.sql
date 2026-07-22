CREATE TABLE IF NOT EXISTS "saas_features" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "key" text NOT NULL,
  "name" text NOT NULL,
  "description" text,
  "category" text NOT NULL,
  "default_enabled" boolean DEFAULT false NOT NULL,
  "is_active" boolean DEFAULT true NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS "saas_features_key_unique"
  ON "saas_features" ("key");

CREATE INDEX IF NOT EXISTS "saas_features_category_idx"
  ON "saas_features" ("category");

CREATE TABLE IF NOT EXISTS "saas_plan_features" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "plan_id" uuid NOT NULL REFERENCES "saas_plans"("id") ON DELETE CASCADE,
  "feature_id" uuid NOT NULL REFERENCES "saas_features"("id") ON DELETE CASCADE,
  "enabled" boolean DEFAULT true NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS "saas_plan_features_plan_feature_unique"
  ON "saas_plan_features" ("plan_id", "feature_id");

CREATE INDEX IF NOT EXISTS "saas_plan_features_feature_idx"
  ON "saas_plan_features" ("feature_id");

CREATE TABLE IF NOT EXISTS "organization_feature_overrides" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "organization_id" uuid NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
  "feature_id" uuid NOT NULL REFERENCES "saas_features"("id") ON DELETE CASCADE,
  "enabled" boolean NOT NULL,
  "reason" text,
  "expires_at" timestamp,
  "updated_by_user_id" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS "organization_feature_overrides_org_feature_unique"
  ON "organization_feature_overrides" ("organization_id", "feature_id");

CREATE INDEX IF NOT EXISTS "organization_feature_overrides_feature_idx"
  ON "organization_feature_overrides" ("feature_id");

CREATE INDEX IF NOT EXISTS "organization_feature_overrides_expires_idx"
  ON "organization_feature_overrides" ("expires_at");

INSERT INTO "saas_features" (
  "key",
  "name",
  "description",
  "category",
  "default_enabled",
  "updated_at"
)
VALUES
  ('ordering.customer', 'Customer ordering', 'Customer-facing restaurant ordering pages.', 'ordering', false, now()),
  ('ordering.customer_accounts', 'Customer accounts', 'Customer login, profile and order history.', 'ordering', false, now()),
  ('auth.social', 'Social login', 'Google, Apple and Facebook customer login.', 'authentication', false, now()),
  ('payments.stripe', 'Stripe payments', 'Stripe Checkout and Stripe Connect payments.', 'payments', false, now()),
  ('payments.staff_billing', 'Staff billing', 'Cash, partial and payment-link settlement for staff-created bills.', 'payments', false, now()),
  ('operations.inventory', 'Product inventory', 'Restaurant product inventory and stock warnings.', 'operations', false, now()),
  ('reports.operational', 'Operational reports', 'Company and restaurant operational reporting.', 'reporting', false, now()),
  ('branding.custom_domains', 'Custom domains', 'Customer-facing custom domain support.', 'branding', false, now())
ON CONFLICT ("key") DO UPDATE SET
  "name" = excluded."name",
  "description" = excluded."description",
  "category" = excluded."category",
  "updated_at" = now();

INSERT INTO "saas_plan_features" (
  "plan_id",
  "feature_id",
  "enabled",
  "updated_at"
)
SELECT
  plan."id",
  feature."id",
  true,
  now()
FROM "saas_plans" plan
CROSS JOIN "saas_features" feature
WHERE plan."is_active" = true
  AND feature."is_active" = true
ON CONFLICT ("plan_id", "feature_id") DO NOTHING;
