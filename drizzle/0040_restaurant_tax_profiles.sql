CREATE TYPE "tax_system" AS ENUM (
  'NONE',
  'VAT',
  'GST',
  'SALES_TAX',
  'OTHER'
);

CREATE TYPE "tax_registration_status" AS ENUM (
  'NOT_REGISTERED',
  'PENDING',
  'REGISTERED'
);

CREATE TABLE "organization_tax_profiles" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "organization_id" uuid NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
  "tax_system" "tax_system" DEFAULT 'NONE' NOT NULL,
  "registration_status" "tax_registration_status" DEFAULT 'NOT_REGISTERED' NOT NULL,
  "registration_number" text,
  "legal_name" text,
  "address_line_1" text,
  "address_line_2" text,
  "city" text,
  "region" text,
  "postal_code" text,
  "country_code" text,
  "default_tax_rate_bps" integer DEFAULT 0 NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "organization_tax_profiles_rate_check"
    CHECK ("default_tax_rate_bps" >= 0 AND "default_tax_rate_bps" <= 10000),
  CONSTRAINT "organization_tax_profiles_country_check"
    CHECK ("country_code" IS NULL OR "country_code" ~ '^[A-Z]{2}$'),
  CONSTRAINT "organization_tax_profiles_none_check"
    CHECK (
      "tax_system" <> 'NONE'
      OR ("registration_status" = 'NOT_REGISTERED' AND "default_tax_rate_bps" = 0)
    ),
  CONSTRAINT "organization_tax_profiles_registered_check"
    CHECK (
      "registration_status" <> 'REGISTERED'
      OR (
        "tax_system" <> 'NONE'
        AND NULLIF(BTRIM("registration_number"), '') IS NOT NULL
        AND NULLIF(BTRIM("legal_name"), '') IS NOT NULL
        AND NULLIF(BTRIM("address_line_1"), '') IS NOT NULL
        AND NULLIF(BTRIM("city"), '') IS NOT NULL
        AND NULLIF(BTRIM("postal_code"), '') IS NOT NULL
        AND NULLIF(BTRIM("country_code"), '') IS NOT NULL
      )
    )
);

CREATE UNIQUE INDEX "organization_tax_profiles_org_unique"
  ON "organization_tax_profiles" ("organization_id");

CREATE INDEX "organization_tax_profiles_status_idx"
  ON "organization_tax_profiles" ("registration_status");
