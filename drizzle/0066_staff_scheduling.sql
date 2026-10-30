CREATE TABLE "staff_scheduled_shifts" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "organization_id" uuid NOT NULL,
  "membership_id" uuid NOT NULL,
  "job_id" uuid NOT NULL,
  "starts_at" timestamp NOT NULL,
  "ends_at" timestamp NOT NULL,
  "break_minutes" integer DEFAULT 0 NOT NULL,
  "status" text DEFAULT 'PUBLISHED' NOT NULL,
  "note" text,
  "created_by_membership_id" uuid NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "staff_scheduled_shifts_range_check" CHECK ("ends_at" > "starts_at"),
  CONSTRAINT "staff_scheduled_shifts_break_minutes_check" CHECK ("break_minutes" BETWEEN 0 AND 480),
  CONSTRAINT "staff_scheduled_shifts_status_check" CHECK ("status" IN ('PUBLISHED', 'CANCELLED')),
  CONSTRAINT "staff_scheduled_shifts_note_check" CHECK ("note" IS NULL OR char_length("note") <= 500)
);

ALTER TABLE "staff_scheduled_shifts"
ADD CONSTRAINT "staff_scheduled_shifts_organization_id_organizations_id_fk"
FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id")
ON DELETE cascade ON UPDATE no action;

ALTER TABLE "staff_scheduled_shifts"
ADD CONSTRAINT "staff_scheduled_shifts_membership_organization_fk"
FOREIGN KEY ("membership_id", "organization_id")
REFERENCES "public"."memberships"("id", "organization_id")
ON DELETE cascade ON UPDATE no action;

ALTER TABLE "staff_scheduled_shifts"
ADD CONSTRAINT "staff_scheduled_shifts_job_organization_fk"
FOREIGN KEY ("job_id", "organization_id")
REFERENCES "public"."restaurant_jobs"("id", "organization_id")
ON DELETE restrict ON UPDATE no action;

ALTER TABLE "staff_scheduled_shifts"
ADD CONSTRAINT "staff_scheduled_shifts_creator_organization_fk"
FOREIGN KEY ("created_by_membership_id", "organization_id")
REFERENCES "public"."memberships"("id", "organization_id")
ON DELETE restrict ON UPDATE no action;

CREATE UNIQUE INDEX "staff_scheduled_shifts_id_organization_unique"
ON "staff_scheduled_shifts" ("id", "organization_id");

CREATE UNIQUE INDEX "staff_scheduled_shifts_member_start_unique"
ON "staff_scheduled_shifts" ("membership_id", "starts_at");

CREATE INDEX "staff_scheduled_shifts_organization_start_idx"
ON "staff_scheduled_shifts" ("organization_id", "starts_at");

CREATE INDEX "staff_scheduled_shifts_member_start_idx"
ON "staff_scheduled_shifts" ("membership_id", "starts_at");

ALTER TABLE "staff_shifts" ADD COLUMN "scheduled_shift_id" uuid;

ALTER TABLE "staff_shifts"
ADD CONSTRAINT "staff_shifts_scheduled_shift_organization_fk"
FOREIGN KEY ("scheduled_shift_id", "organization_id")
REFERENCES "public"."staff_scheduled_shifts"("id", "organization_id")
ON DELETE restrict ON UPDATE no action;

CREATE UNIQUE INDEX "staff_shifts_scheduled_shift_unique"
ON "staff_shifts" ("scheduled_shift_id")
WHERE "scheduled_shift_id" IS NOT NULL;
