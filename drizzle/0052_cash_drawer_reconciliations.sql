CREATE TABLE "cash_drawer_reconciliations" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "organization_id" uuid NOT NULL,
  "cash_drawer_session_id" uuid NOT NULL,
  "currency" text NOT NULL,
  "opening_float" numeric(10, 2) NOT NULL,
  "cash_sales_amount" numeric(10, 2) NOT NULL,
  "cash_refunds_amount" numeric(10, 2) NOT NULL,
  "paid_in_amount" numeric(10, 2) NOT NULL,
  "paid_out_amount" numeric(10, 2) NOT NULL,
  "expected_cash_amount" numeric(10, 2) NOT NULL,
  "counted_cash_amount" numeric(10, 2) NOT NULL,
  "variance_amount" numeric(10, 2) NOT NULL,
  "closing_note" text,
  "closed_by_membership_id" uuid,
  "closed_by_user_id" uuid,
  "created_at" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "cash_drawer_reconciliations_nonnegative_amounts_check"
    CHECK (
      "opening_float" >= 0
      AND "cash_sales_amount" >= 0
      AND "cash_refunds_amount" >= 0
      AND "paid_in_amount" >= 0
      AND "paid_out_amount" >= 0
      AND "expected_cash_amount" >= 0
      AND "counted_cash_amount" >= 0
    ),
  CONSTRAINT "cash_drawer_reconciliations_expected_cash_check"
    CHECK (
      "expected_cash_amount" = "opening_float" + "cash_sales_amount" + "paid_in_amount" - "cash_refunds_amount" - "paid_out_amount"
    ),
  CONSTRAINT "cash_drawer_reconciliations_variance_check"
    CHECK ("variance_amount" = "counted_cash_amount" - "expected_cash_amount"),
  CONSTRAINT "cash_drawer_reconciliations_closing_note_check"
    CHECK ("closing_note" IS NULL OR char_length("closing_note") <= 500)
);

ALTER TABLE "cash_drawer_reconciliations"
ADD CONSTRAINT "cash_drawer_reconciliations_organization_id_organizations_id_fk"
FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id")
ON DELETE cascade ON UPDATE no action;

ALTER TABLE "cash_drawer_reconciliations"
ADD CONSTRAINT "cash_drawer_reconciliations_session_organization_fk"
FOREIGN KEY ("cash_drawer_session_id", "organization_id")
REFERENCES "public"."cash_drawer_sessions"("id", "organization_id")
ON DELETE cascade ON UPDATE no action;

ALTER TABLE "cash_drawer_reconciliations"
ADD CONSTRAINT "cash_drawer_reconciliations_closed_by_membership_id_memberships_id_fk"
FOREIGN KEY ("closed_by_membership_id") REFERENCES "public"."memberships"("id")
ON DELETE set null ON UPDATE no action;

ALTER TABLE "cash_drawer_reconciliations"
ADD CONSTRAINT "cash_drawer_reconciliations_closed_by_user_id_users_id_fk"
FOREIGN KEY ("closed_by_user_id") REFERENCES "public"."users"("id")
ON DELETE set null ON UPDATE no action;

CREATE UNIQUE INDEX "cash_drawer_reconciliations_session_unique"
ON "cash_drawer_reconciliations" ("cash_drawer_session_id");

CREATE INDEX "cash_drawer_reconciliations_organization_created_idx"
ON "cash_drawer_reconciliations" ("organization_id", "created_at");
