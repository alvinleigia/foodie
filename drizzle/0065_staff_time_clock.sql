CREATE TABLE "staff_shifts" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "organization_id" uuid NOT NULL,
  "membership_id" uuid NOT NULL,
  "job_id" uuid NOT NULL,
  "job_name_snapshot" text NOT NULL,
  "clocked_in_at" timestamp DEFAULT now() NOT NULL,
  "clocked_out_at" timestamp,
  "clock_in_note" text,
  "clock_out_note" text,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "staff_shifts_job_name_snapshot_check"
    CHECK (char_length(btrim("job_name_snapshot")) BETWEEN 1 AND 80),
  CONSTRAINT "staff_shifts_clock_range_check"
    CHECK ("clocked_out_at" IS NULL OR "clocked_out_at" >= "clocked_in_at"),
  CONSTRAINT "staff_shifts_clock_in_note_check"
    CHECK ("clock_in_note" IS NULL OR char_length("clock_in_note") <= 500),
  CONSTRAINT "staff_shifts_clock_out_note_check"
    CHECK ("clock_out_note" IS NULL OR char_length("clock_out_note") <= 500)
);

ALTER TABLE "staff_shifts"
ADD CONSTRAINT "staff_shifts_organization_id_organizations_id_fk"
FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id")
ON DELETE cascade ON UPDATE no action;

ALTER TABLE "staff_shifts"
ADD CONSTRAINT "staff_shifts_membership_organization_fk"
FOREIGN KEY ("membership_id", "organization_id")
REFERENCES "public"."memberships"("id", "organization_id")
ON DELETE cascade ON UPDATE no action;

ALTER TABLE "staff_shifts"
ADD CONSTRAINT "staff_shifts_job_organization_fk"
FOREIGN KEY ("job_id", "organization_id")
REFERENCES "public"."restaurant_jobs"("id", "organization_id")
ON DELETE restrict ON UPDATE no action;

CREATE UNIQUE INDEX "staff_shifts_id_organization_unique"
ON "staff_shifts" ("id", "organization_id");

CREATE UNIQUE INDEX "staff_shifts_open_membership_unique"
ON "staff_shifts" ("membership_id")
WHERE "clocked_out_at" IS NULL;

CREATE INDEX "staff_shifts_organization_clocked_in_idx"
ON "staff_shifts" ("organization_id", "clocked_in_at");

CREATE TABLE "staff_shift_breaks" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "organization_id" uuid NOT NULL,
  "staff_shift_id" uuid NOT NULL,
  "started_at" timestamp DEFAULT now() NOT NULL,
  "ended_at" timestamp,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "staff_shift_breaks_range_check"
    CHECK ("ended_at" IS NULL OR "ended_at" >= "started_at")
);

ALTER TABLE "staff_shift_breaks"
ADD CONSTRAINT "staff_shift_breaks_organization_id_organizations_id_fk"
FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id")
ON DELETE cascade ON UPDATE no action;

ALTER TABLE "staff_shift_breaks"
ADD CONSTRAINT "staff_shift_breaks_shift_organization_fk"
FOREIGN KEY ("staff_shift_id", "organization_id")
REFERENCES "public"."staff_shifts"("id", "organization_id")
ON DELETE cascade ON UPDATE no action;

CREATE UNIQUE INDEX "staff_shift_breaks_open_shift_unique"
ON "staff_shift_breaks" ("staff_shift_id")
WHERE "ended_at" IS NULL;

CREATE INDEX "staff_shift_breaks_organization_started_idx"
ON "staff_shift_breaks" ("organization_id", "started_at");
