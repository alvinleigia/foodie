CREATE TABLE "customer_auth_handoffs" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "customer_id" uuid NOT NULL,
  "organization_id" uuid NOT NULL,
  "token_hash" text NOT NULL,
  "destination_origin" text NOT NULL,
  "return_to" text NOT NULL,
  "expires_at" timestamp NOT NULL,
  "consumed_at" timestamp,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "customer_auth_handoffs_customer_id_customers_id_fk"
    FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id")
    ON DELETE cascade ON UPDATE no action,
  CONSTRAINT "customer_auth_handoffs_organization_id_organizations_id_fk"
    FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id")
    ON DELETE cascade ON UPDATE no action
);

CREATE UNIQUE INDEX "customer_auth_handoffs_token_hash_unique"
  ON "customer_auth_handoffs" USING btree ("token_hash");
CREATE INDEX "customer_auth_handoffs_customer_idx"
  ON "customer_auth_handoffs" USING btree ("customer_id");
CREATE INDEX "customer_auth_handoffs_expires_idx"
  ON "customer_auth_handoffs" USING btree ("expires_at");
