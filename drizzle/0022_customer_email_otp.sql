CREATE TABLE "customer_email_otps" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "email" text NOT NULL,
  "code_hash" text NOT NULL,
  "attempts" integer DEFAULT 0 NOT NULL,
  "expires_at" timestamp NOT NULL,
  "consumed_at" timestamp,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);

CREATE INDEX "customer_email_otps_email_created_idx"
  ON "customer_email_otps" USING btree ("email", "created_at");
CREATE INDEX "customer_email_otps_expires_idx"
  ON "customer_email_otps" USING btree ("expires_at");
