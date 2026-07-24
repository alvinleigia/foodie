CREATE TYPE "tax_treatment" AS ENUM (
  'TAXABLE',
  'ZERO_RATED',
  'EXEMPT',
  'OUT_OF_SCOPE'
);

CREATE TABLE "organization_tax_definitions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "organization_id" uuid NOT NULL,
  "code" text NOT NULL,
  "name" text NOT NULL,
  "treatment" "tax_treatment" DEFAULT 'TAXABLE' NOT NULL,
  "is_compound" boolean DEFAULT false NOT NULL,
  "calculation_order" integer DEFAULT 0 NOT NULL,
  "is_active" boolean DEFAULT true NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "organization_tax_definitions_code_check"
    CHECK ("code" ~ '^[A-Z0-9][A-Z0-9_-]{0,31}$'),
  CONSTRAINT "organization_tax_definitions_name_check"
    CHECK (char_length(btrim("name")) BETWEEN 1 AND 80),
  CONSTRAINT "organization_tax_definitions_order_check"
    CHECK ("calculation_order" >= 0)
);

ALTER TABLE "organization_tax_definitions"
ADD CONSTRAINT "organization_tax_definitions_organization_id_organizations_id_fk"
FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id")
ON DELETE cascade ON UPDATE no action;

CREATE UNIQUE INDEX "organization_tax_definitions_id_org_unique"
ON "organization_tax_definitions" ("id", "organization_id");

CREATE UNIQUE INDEX "organization_tax_definitions_org_code_unique"
ON "organization_tax_definitions" ("organization_id", "code");

CREATE INDEX "organization_tax_definitions_org_active_idx"
ON "organization_tax_definitions" (
  "organization_id",
  "is_active",
  "calculation_order"
);

CREATE TABLE "organization_tax_rates" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "organization_id" uuid NOT NULL,
  "tax_definition_id" uuid NOT NULL,
  "rate_bps" integer NOT NULL,
  "effective_from" date NOT NULL,
  "effective_to" date,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "organization_tax_rates_rate_check"
    CHECK ("rate_bps" >= 0 AND "rate_bps" <= 10000),
  CONSTRAINT "organization_tax_rates_effective_range_check"
    CHECK ("effective_to" IS NULL OR "effective_to" >= "effective_from")
);

ALTER TABLE "organization_tax_rates"
ADD CONSTRAINT "organization_tax_rates_organization_id_organizations_id_fk"
FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id")
ON DELETE cascade ON UPDATE no action;

ALTER TABLE "organization_tax_rates"
ADD CONSTRAINT "organization_tax_rates_definition_org_fk"
FOREIGN KEY ("tax_definition_id", "organization_id")
REFERENCES "public"."organization_tax_definitions"("id", "organization_id")
ON DELETE cascade ON UPDATE no action;

CREATE UNIQUE INDEX "organization_tax_rates_definition_from_unique"
ON "organization_tax_rates" ("tax_definition_id", "effective_from");

CREATE INDEX "organization_tax_rates_org_effective_idx"
ON "organization_tax_rates" (
  "organization_id",
  "effective_from",
  "effective_to"
);

CREATE TABLE "organization_default_taxes" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "organization_id" uuid NOT NULL,
  "tax_definition_id" uuid NOT NULL,
  "sort_order" integer DEFAULT 0 NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "organization_default_taxes_sort_order_check"
    CHECK ("sort_order" >= 0)
);

ALTER TABLE "organization_default_taxes"
ADD CONSTRAINT "organization_default_taxes_organization_id_organizations_id_fk"
FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id")
ON DELETE cascade ON UPDATE no action;

ALTER TABLE "organization_default_taxes"
ADD CONSTRAINT "organization_default_taxes_definition_org_fk"
FOREIGN KEY ("tax_definition_id", "organization_id")
REFERENCES "public"."organization_tax_definitions"("id", "organization_id")
ON DELETE cascade ON UPDATE no action;

CREATE UNIQUE INDEX "organization_default_taxes_org_definition_unique"
ON "organization_default_taxes" ("organization_id", "tax_definition_id");

CREATE INDEX "organization_default_taxes_org_sort_idx"
ON "organization_default_taxes" ("organization_id", "sort_order");

CREATE UNIQUE INDEX "menu_items_id_organization_unique"
ON "menu_items" ("id", "organization_id");

CREATE TABLE "menu_item_tax_assignments" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "organization_id" uuid NOT NULL,
  "menu_item_id" uuid NOT NULL,
  "tax_definition_id" uuid NOT NULL,
  "sort_order" integer DEFAULT 0 NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "menu_item_tax_assignments_sort_order_check"
    CHECK ("sort_order" >= 0)
);

ALTER TABLE "menu_item_tax_assignments"
ADD CONSTRAINT "menu_item_tax_assignments_organization_id_organizations_id_fk"
FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id")
ON DELETE cascade ON UPDATE no action;

ALTER TABLE "menu_item_tax_assignments"
ADD CONSTRAINT "menu_item_tax_assignments_item_org_fk"
FOREIGN KEY ("menu_item_id", "organization_id")
REFERENCES "public"."menu_items"("id", "organization_id")
ON DELETE cascade ON UPDATE no action;

ALTER TABLE "menu_item_tax_assignments"
ADD CONSTRAINT "menu_item_tax_assignments_definition_org_fk"
FOREIGN KEY ("tax_definition_id", "organization_id")
REFERENCES "public"."organization_tax_definitions"("id", "organization_id")
ON DELETE cascade ON UPDATE no action;

CREATE UNIQUE INDEX "menu_item_tax_assignments_item_definition_unique"
ON "menu_item_tax_assignments" ("menu_item_id", "tax_definition_id");

CREATE INDEX "menu_item_tax_assignments_org_item_idx"
ON "menu_item_tax_assignments" (
  "organization_id",
  "menu_item_id",
  "sort_order"
);

CREATE TABLE "order_item_tax_components" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "organization_id" uuid NOT NULL,
  "order_id" uuid NOT NULL,
  "order_item_id" uuid NOT NULL,
  "tax_definition_id" uuid,
  "tax_code_snapshot" text NOT NULL,
  "tax_name_snapshot" text NOT NULL,
  "treatment_snapshot" "tax_treatment" NOT NULL,
  "pricing_mode_snapshot" "tax_pricing_mode" NOT NULL,
  "rate_bps_snapshot" integer NOT NULL,
  "is_compound_snapshot" boolean DEFAULT false NOT NULL,
  "calculation_order_snapshot" integer DEFAULT 0 NOT NULL,
  "taxable_amount_snapshot" numeric(10, 2) NOT NULL,
  "tax_amount_snapshot" numeric(10, 2) NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "order_item_tax_components_code_check"
    CHECK (char_length(btrim("tax_code_snapshot")) BETWEEN 1 AND 32),
  CONSTRAINT "order_item_tax_components_name_check"
    CHECK (char_length(btrim("tax_name_snapshot")) BETWEEN 1 AND 80),
  CONSTRAINT "order_item_tax_components_rate_check"
    CHECK ("rate_bps_snapshot" >= 0 AND "rate_bps_snapshot" <= 10000),
  CONSTRAINT "order_item_tax_components_order_check"
    CHECK ("calculation_order_snapshot" >= 0),
  CONSTRAINT "order_item_tax_components_amounts_check"
    CHECK ("taxable_amount_snapshot" >= 0 AND "tax_amount_snapshot" >= 0)
);

ALTER TABLE "order_item_tax_components"
ADD CONSTRAINT "order_item_tax_components_organization_id_organizations_id_fk"
FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id")
ON DELETE cascade ON UPDATE no action;

ALTER TABLE "order_item_tax_components"
ADD CONSTRAINT "order_item_tax_components_order_id_orders_id_fk"
FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id")
ON DELETE cascade ON UPDATE no action;

ALTER TABLE "order_item_tax_components"
ADD CONSTRAINT "order_item_tax_components_tax_definition_id_fk"
FOREIGN KEY ("tax_definition_id")
REFERENCES "public"."organization_tax_definitions"("id")
ON DELETE set null ON UPDATE no action;

ALTER TABLE "order_item_tax_components"
ADD CONSTRAINT "order_item_tax_components_item_order_org_fk"
FOREIGN KEY ("order_item_id", "order_id", "organization_id")
REFERENCES "public"."order_items"("id", "order_id", "organization_id")
ON DELETE cascade ON UPDATE no action;

CREATE UNIQUE INDEX "order_item_tax_components_item_code_unique"
ON "order_item_tax_components" ("order_item_id", "tax_code_snapshot");

CREATE INDEX "order_item_tax_components_org_order_idx"
ON "order_item_tax_components" (
  "organization_id",
  "order_id",
  "order_item_id"
);

INSERT INTO "organization_tax_definitions" (
  "organization_id",
  "code",
  "name",
  "treatment",
  "is_compound",
  "calculation_order"
)
SELECT
  "organization_id",
  'DEFAULT',
  CASE "tax_system"
    WHEN 'VAT' THEN 'VAT'
    WHEN 'GST' THEN 'GST'
    WHEN 'SALES_TAX' THEN 'Sales tax'
    ELSE 'Tax'
  END,
  CASE
    WHEN "default_tax_rate_bps" = 0 THEN 'ZERO_RATED'::"tax_treatment"
    ELSE 'TAXABLE'::"tax_treatment"
  END,
  false,
  0
FROM "organization_tax_profiles"
WHERE "tax_system" <> 'NONE'
ON CONFLICT ("organization_id", "code") DO NOTHING;

INSERT INTO "organization_tax_rates" (
  "organization_id",
  "tax_definition_id",
  "rate_bps",
  "effective_from"
)
SELECT
  profile."organization_id",
  definition."id",
  profile."default_tax_rate_bps",
  DATE '1970-01-01'
FROM "organization_tax_profiles" profile
INNER JOIN "organization_tax_definitions" definition
  ON definition."organization_id" = profile."organization_id"
  AND definition."code" = 'DEFAULT'
WHERE profile."tax_system" <> 'NONE'
ON CONFLICT ("tax_definition_id", "effective_from") DO NOTHING;

INSERT INTO "organization_default_taxes" (
  "organization_id",
  "tax_definition_id",
  "sort_order"
)
SELECT
  definition."organization_id",
  definition."id",
  definition."calculation_order"
FROM "organization_tax_definitions" definition
WHERE definition."code" = 'DEFAULT'
ON CONFLICT ("organization_id", "tax_definition_id") DO NOTHING;

INSERT INTO "order_item_tax_components" (
  "organization_id",
  "order_id",
  "order_item_id",
  "tax_definition_id",
  "tax_code_snapshot",
  "tax_name_snapshot",
  "treatment_snapshot",
  "pricing_mode_snapshot",
  "rate_bps_snapshot",
  "is_compound_snapshot",
  "calculation_order_snapshot",
  "taxable_amount_snapshot",
  "tax_amount_snapshot"
)
SELECT
  item."organization_id",
  item."order_id",
  item."id",
  definition."id",
  COALESCE(definition."code", 'LEGACY'),
  COALESCE(definition."name", 'Legacy tax'),
  COALESCE(
    definition."treatment",
    CASE
      WHEN item."tax_rate_bps_snapshot" = 0
        THEN 'ZERO_RATED'::"tax_treatment"
      ELSE 'TAXABLE'::"tax_treatment"
    END
  ),
  parent_order."tax_pricing_mode_snapshot",
  item."tax_rate_bps_snapshot",
  false,
  0,
  item."taxable_amount_snapshot",
  item."tax_amount_snapshot"
FROM "order_items" item
INNER JOIN "orders" parent_order
  ON parent_order."id" = item."order_id"
  AND parent_order."organization_id" = item."organization_id"
LEFT JOIN "organization_tax_definitions" definition
  ON definition."organization_id" = item."organization_id"
  AND definition."code" = 'DEFAULT'
WHERE item."taxable_amount_snapshot" IS NOT NULL
  AND item."tax_amount_snapshot" IS NOT NULL
  AND (
    definition."id" IS NOT NULL
    OR item."tax_rate_bps_snapshot" > 0
    OR item."tax_amount_snapshot" > 0
  )
ON CONFLICT ("order_item_id", "tax_code_snapshot") DO NOTHING;
