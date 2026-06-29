CREATE TYPE "public"."subscription_status" AS ENUM (
  'TRIALING',
  'ACTIVE',
  'PAST_DUE',
  'SUSPENDED',
  'CANCELLED'
);

CREATE TABLE IF NOT EXISTS "saas_plans" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "slug" text NOT NULL,
  "name" text NOT NULL,
  "monthly_price" numeric(10, 2) DEFAULT '0' NOT NULL,
  "max_restaurants" integer DEFAULT 1 NOT NULL,
  "max_locations" integer DEFAULT 1 NOT NULL,
  "max_users" integer DEFAULT 5 NOT NULL,
  "max_monthly_orders" integer DEFAULT 500 NOT NULL,
  "storage_mb" integer DEFAULT 256 NOT NULL,
  "is_active" boolean DEFAULT true NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS "saas_plans_slug_unique"
  ON "saas_plans" ("slug");

CREATE TABLE IF NOT EXISTS "organization_subscriptions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "organization_id" uuid NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
  "plan_id" uuid NOT NULL REFERENCES "saas_plans"("id"),
  "status" "subscription_status" DEFAULT 'TRIALING' NOT NULL,
  "trial_ends_at" timestamp,
  "current_period_ends_at" timestamp,
  "external_customer_id" text,
  "external_subscription_id" text,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS "organization_subscriptions_org_unique"
  ON "organization_subscriptions" ("organization_id");

CREATE INDEX IF NOT EXISTS "organization_subscriptions_plan_idx"
  ON "organization_subscriptions" ("plan_id");

CREATE INDEX IF NOT EXISTS "organization_subscriptions_status_idx"
  ON "organization_subscriptions" ("status");

INSERT INTO "saas_plans" (
  "slug",
  "name",
  "monthly_price",
  "max_restaurants",
  "max_locations",
  "max_users",
  "max_monthly_orders",
  "storage_mb",
  "updated_at"
)
VALUES
  ('starter', 'Starter', '0', 1, 1, 5, 500, 256, now()),
  ('growth', 'Growth', '49', 3, 10, 25, 5000, 1024, now()),
  ('group', 'Group', '149', 25, 100, 150, 50000, 5120, now())
ON CONFLICT ("slug") DO UPDATE SET
  "name" = excluded."name",
  "monthly_price" = excluded."monthly_price",
  "max_restaurants" = excluded."max_restaurants",
  "max_locations" = excluded."max_locations",
  "max_users" = excluded."max_users",
  "max_monthly_orders" = excluded."max_monthly_orders",
  "storage_mb" = excluded."storage_mb",
  "updated_at" = now();

INSERT INTO "organization_subscriptions" (
  "organization_id",
  "plan_id",
  "status",
  "trial_ends_at",
  "current_period_ends_at",
  "updated_at"
)
SELECT
  company."id",
  plan."id",
  'TRIALING',
  now() + interval '14 days',
  now() + interval '14 days',
  now()
FROM "organizations" company
CROSS JOIN "saas_plans" plan
WHERE company."type" = 'COMPANY'
  AND plan."slug" = 'starter'
ON CONFLICT ("organization_id") DO NOTHING;
