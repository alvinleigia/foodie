ALTER TABLE "staff_scheduled_shifts"
ADD COLUMN "availability_override_reason" text;

ALTER TABLE "staff_scheduled_shifts"
ADD CONSTRAINT "staff_scheduled_shifts_availability_override_reason_check"
CHECK (
  "availability_override_reason" IS NULL
  OR (
    char_length(btrim("availability_override_reason")) > 0
    AND char_length("availability_override_reason") <= 500
  )
);

CREATE TABLE "staff_weekly_availability" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "organization_id" uuid NOT NULL,
  "membership_id" uuid NOT NULL,
  "day_of_week" integer NOT NULL,
  "is_available" boolean DEFAULT false NOT NULL,
  "starts_minute" integer,
  "ends_minute" integer,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "staff_weekly_availability_day_check" CHECK ("day_of_week" BETWEEN 0 AND 6),
  CONSTRAINT "staff_weekly_availability_window_check" CHECK (
    ("is_available" = false AND "starts_minute" IS NULL AND "ends_minute" IS NULL)
    OR (
      "is_available" = true
      AND "starts_minute" >= 0
      AND "ends_minute" <= 1440
      AND "ends_minute" > "starts_minute"
    )
  )
);

ALTER TABLE "staff_weekly_availability"
ADD CONSTRAINT "staff_weekly_availability_organization_id_organizations_id_fk"
FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id")
ON DELETE cascade ON UPDATE no action;

ALTER TABLE "staff_weekly_availability"
ADD CONSTRAINT "staff_weekly_availability_membership_organization_fk"
FOREIGN KEY ("membership_id", "organization_id")
REFERENCES "public"."memberships"("id", "organization_id")
ON DELETE cascade ON UPDATE no action;

CREATE UNIQUE INDEX "staff_weekly_availability_member_day_unique"
ON "staff_weekly_availability" ("membership_id", "day_of_week");

CREATE INDEX "staff_weekly_availability_organization_idx"
ON "staff_weekly_availability" ("organization_id", "membership_id");
