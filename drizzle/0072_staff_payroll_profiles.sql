CREATE TABLE "staff_payroll_profiles" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "organization_id" uuid NOT NULL,
  "membership_id" uuid NOT NULL,
  "employee_reference" text NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "staff_payroll_profiles_membership_organization_fk"
    FOREIGN KEY ("membership_id", "organization_id")
    REFERENCES "memberships" ("id", "organization_id")
    ON DELETE CASCADE,
  CONSTRAINT "staff_payroll_profiles_employee_reference_check"
    CHECK (char_length(btrim("employee_reference")) BETWEEN 1 AND 80)
);

CREATE UNIQUE INDEX "staff_payroll_profiles_membership_unique"
  ON "staff_payroll_profiles" ("membership_id");

CREATE INDEX "staff_payroll_profiles_organization_idx"
  ON "staff_payroll_profiles" ("organization_id", "employee_reference");
