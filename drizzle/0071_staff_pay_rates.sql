ALTER TABLE "staff_job_assignments"
  ADD COLUMN "hourly_rate_minor" integer;

ALTER TABLE "staff_job_assignments"
  ADD CONSTRAINT "staff_job_assignments_hourly_rate_check"
  CHECK ("hourly_rate_minor" IS NULL OR "hourly_rate_minor" BETWEEN 0 AND 1000000);

ALTER TABLE "staff_shifts"
  ADD COLUMN "hourly_rate_minor_snapshot" integer,
  ADD COLUMN "pay_currency_snapshot" text;

ALTER TABLE "staff_shifts"
  ADD CONSTRAINT "staff_shifts_pay_snapshot_check"
  CHECK (
    ("hourly_rate_minor_snapshot" IS NULL AND "pay_currency_snapshot" IS NULL)
    OR (
      "hourly_rate_minor_snapshot" BETWEEN 0 AND 1000000
      AND char_length("pay_currency_snapshot") = 3
      AND "pay_currency_snapshot" = upper("pay_currency_snapshot")
    )
  );
