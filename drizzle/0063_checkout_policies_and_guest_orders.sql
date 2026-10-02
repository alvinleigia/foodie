CREATE TYPE "checkout_contact_requirement" AS ENUM (
  'EMAIL',
  'PHONE',
  'EMAIL_OR_PHONE',
  'EMAIL_AND_PHONE'
);

CREATE TYPE "checkout_payment_timing" AS ENUM (
  'ONLINE',
  'PAY_LATER'
);

CREATE TYPE "order_checkout_mode" AS ENUM (
  'GUEST',
  'ACCOUNT',
  'STAFF'
);

ALTER TABLE "customers"
ALTER COLUMN "email" DROP NOT NULL;

DROP INDEX "customers_email_unique";

CREATE UNIQUE INDEX "customers_email_unique"
ON "customers" (lower("email"))
WHERE "email" IS NOT NULL;

DROP INDEX "customers_phone_idx";

CREATE UNIQUE INDEX "customers_phone_unique"
ON "customers" ("phone")
WHERE "phone" IS NOT NULL;

CREATE TABLE "restaurant_checkout_policies" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "organization_id" uuid NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
  "fulfilment_type" "order_fulfilment_type" NOT NULL,
  "is_enabled" boolean DEFAULT true NOT NULL,
  "guest_checkout_enabled" boolean DEFAULT true NOT NULL,
  "account_checkout_enabled" boolean DEFAULT true NOT NULL,
  "email_otp_login_enabled" boolean DEFAULT true NOT NULL,
  "sms_otp_login_enabled" boolean DEFAULT true NOT NULL,
  "online_payment_enabled" boolean DEFAULT true NOT NULL,
  "pay_later_enabled" boolean DEFAULT true NOT NULL,
  "default_payment_timing" "checkout_payment_timing" DEFAULT 'ONLINE' NOT NULL,
  "contact_requirement" "checkout_contact_requirement" DEFAULT 'EMAIL_OR_PHONE' NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "restaurant_checkout_policies_checkout_path_check"
    CHECK ("guest_checkout_enabled" OR "account_checkout_enabled"),
  CONSTRAINT "restaurant_checkout_policies_guest_online_check"
    CHECK (NOT "guest_checkout_enabled" OR "online_payment_enabled"),
  CONSTRAINT "restaurant_checkout_policies_payment_path_check"
    CHECK ("online_payment_enabled" OR "pay_later_enabled"),
  CONSTRAINT "restaurant_checkout_policies_default_payment_check"
    CHECK (
      ("default_payment_timing" = 'ONLINE' AND "online_payment_enabled")
      OR
      ("default_payment_timing" = 'PAY_LATER' AND "pay_later_enabled")
    )
);

CREATE UNIQUE INDEX "restaurant_checkout_policies_org_type_unique"
ON "restaurant_checkout_policies" ("organization_id", "fulfilment_type");

CREATE INDEX "restaurant_checkout_policies_org_idx"
ON "restaurant_checkout_policies" ("organization_id");

INSERT INTO "restaurant_checkout_policies" (
  "organization_id",
  "fulfilment_type",
  "contact_requirement"
)
SELECT
  "organizations"."id",
  "fulfilment_types"."fulfilment_type"::"order_fulfilment_type",
  CASE
    WHEN "fulfilment_types"."fulfilment_type" = 'DELIVERY'
      THEN 'EMAIL_AND_PHONE'::"checkout_contact_requirement"
    ELSE 'EMAIL_OR_PHONE'::"checkout_contact_requirement"
  END
FROM "organizations"
CROSS JOIN (
  VALUES ('DINE_IN'), ('PICKUP'), ('DELIVERY')
) AS "fulfilment_types"("fulfilment_type")
WHERE "organizations"."type" = 'RESTAURANT';

ALTER TABLE "orders"
ADD COLUMN "checkout_mode" "order_checkout_mode" DEFAULT 'ACCOUNT' NOT NULL,
ADD COLUMN "payment_timing" "checkout_payment_timing",
ADD COLUMN "customer_email" text,
ADD COLUMN "customer_phone" text,
ADD COLUMN "customer_email_verified_at" timestamp,
ADD COLUMN "customer_phone_verified_at" timestamp,
ADD COLUMN "delivery_region" text,
ADD COLUMN "delivery_country_code" text;

UPDATE "orders"
SET
  "checkout_mode" = CASE
    WHEN "source" = 'STAFF_CREATED' THEN 'STAFF'::"order_checkout_mode"
    ELSE 'ACCOUNT'::"order_checkout_mode"
  END,
  "payment_timing" = CASE
    WHEN "source" = 'STAFF_CREATED' THEN 'PAY_LATER'::"checkout_payment_timing"
    ELSE 'ONLINE'::"checkout_payment_timing"
  END;

UPDATE "orders"
SET "delivery_country_code" = 'GB'
WHERE "fulfilment_type" = 'DELIVERY'
  AND "delivery_address_line_1" IS NOT NULL
  AND "delivery_country_code" IS NULL;

UPDATE "orders"
SET
  "customer_email" = "customers"."email",
  "customer_email_verified_at" = "customers"."email_verified_at"
FROM "customers"
WHERE "orders"."customer_id" = "customers"."id";

UPDATE "orders"
SET
  "customer_phone" = "organization_customers"."phone",
  "customer_phone_verified_at" = "organization_customers"."phone_verified_at"
FROM "organization_customers"
WHERE "orders"."organization_customer_id" = "organization_customers"."id";
