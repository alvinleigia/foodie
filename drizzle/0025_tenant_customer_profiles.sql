CREATE TABLE "organization_customers" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "organization_id" uuid NOT NULL,
  "customer_id" uuid NOT NULL,
  "name" text NOT NULL,
  "phone" text,
  "phone_verified_at" timestamp,
  "date_of_birth" date,
  "gender" text,
  "marketing_opt_in" boolean DEFAULT false NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "organization_customers_organization_id_organizations_id_fk"
    FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id")
    ON DELETE cascade ON UPDATE no action,
  CONSTRAINT "organization_customers_customer_id_customers_id_fk"
    FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id")
    ON DELETE cascade ON UPDATE no action
);

CREATE UNIQUE INDEX "organization_customers_org_customer_unique"
  ON "organization_customers" USING btree ("organization_id", "customer_id");
CREATE INDEX "organization_customers_org_name_idx"
  ON "organization_customers" USING btree ("organization_id", "name");
CREATE INDEX "organization_customers_phone_idx"
  ON "organization_customers" USING btree ("phone");

INSERT INTO "organization_customers" (
  "organization_id",
  "customer_id",
  "name",
  "phone",
  "phone_verified_at",
  "date_of_birth",
  "gender",
  "marketing_opt_in",
  "created_at",
  "updated_at"
)
SELECT
  "orders"."organization_id",
  "customers"."id",
  "customers"."name",
  "customers"."phone",
  "customers"."phone_verified_at",
  "customers"."date_of_birth",
  "customers"."gender",
  "customers"."marketing_opt_in",
  LEAST("customers"."created_at", MIN("orders"."created_at")),
  GREATEST("customers"."updated_at", MAX("orders"."updated_at"))
FROM "orders"
INNER JOIN "customers" ON "customers"."id" = "orders"."customer_id"
GROUP BY "orders"."organization_id", "customers"."id"
ON CONFLICT ("organization_id", "customer_id") DO NOTHING;

ALTER TABLE "orders"
  ADD COLUMN "organization_customer_id" uuid;

ALTER TABLE "orders"
  ADD CONSTRAINT "orders_organization_customer_id_organization_customers_id_fk"
  FOREIGN KEY ("organization_customer_id")
  REFERENCES "public"."organization_customers"("id")
  ON DELETE set null ON UPDATE no action;

UPDATE "orders"
SET "organization_customer_id" = "organization_customers"."id"
FROM "organization_customers"
WHERE "orders"."organization_id" = "organization_customers"."organization_id"
  AND "orders"."customer_id" = "organization_customers"."customer_id";

CREATE INDEX "orders_organization_customer_created_idx"
  ON "orders" USING btree ("organization_customer_id", "created_at");
