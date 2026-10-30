CREATE TABLE "staff_payroll_export_runs" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "organization_id" uuid NOT NULL REFERENCES "organizations" ("id") ON DELETE CASCADE,
  "provider" text DEFAULT 'GENERIC_CSV' NOT NULL,
  "period_from" date NOT NULL,
  "period_to" date NOT NULL,
  "row_count" integer NOT NULL,
  "currency" text NOT NULL,
  "gross_pay_minor" integer NOT NULL,
  "csv_content" text NOT NULL,
  "generated_by_user_id" uuid REFERENCES "users" ("id") ON DELETE SET NULL,
  "generated_by_name_snapshot" text NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "staff_payroll_export_runs_provider_check"
    CHECK ("provider" IN ('GENERIC_CSV')),
  CONSTRAINT "staff_payroll_export_runs_period_check"
    CHECK ("period_to" >= "period_from"),
  CONSTRAINT "staff_payroll_export_runs_totals_check"
    CHECK (
      "row_count" > 0
      AND "gross_pay_minor" >= 0
      AND char_length("currency") = 3
      AND "currency" = upper("currency")
    ),
  CONSTRAINT "staff_payroll_export_runs_content_check"
    CHECK (
      char_length("csv_content") > 0
      AND char_length(btrim("generated_by_name_snapshot")) BETWEEN 1 AND 120
    )
);

CREATE UNIQUE INDEX "staff_payroll_export_runs_id_organization_unique"
  ON "staff_payroll_export_runs" ("id", "organization_id");

CREATE INDEX "staff_payroll_export_runs_organization_created_idx"
  ON "staff_payroll_export_runs" ("organization_id", "created_at");

CREATE TABLE "staff_payroll_export_entries" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "organization_id" uuid NOT NULL REFERENCES "organizations" ("id") ON DELETE CASCADE,
  "export_run_id" uuid NOT NULL,
  "staff_shift_id" uuid NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "staff_payroll_export_entries_run_organization_fk"
    FOREIGN KEY ("export_run_id", "organization_id")
    REFERENCES "staff_payroll_export_runs" ("id", "organization_id")
    ON DELETE CASCADE,
  CONSTRAINT "staff_payroll_export_entries_shift_organization_fk"
    FOREIGN KEY ("staff_shift_id", "organization_id")
    REFERENCES "staff_shifts" ("id", "organization_id")
    ON DELETE RESTRICT
);

CREATE UNIQUE INDEX "staff_payroll_export_entries_shift_unique"
  ON "staff_payroll_export_entries" ("staff_shift_id");

CREATE INDEX "staff_payroll_export_entries_run_idx"
  ON "staff_payroll_export_entries" ("export_run_id");
