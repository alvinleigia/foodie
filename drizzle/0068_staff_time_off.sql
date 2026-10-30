CREATE TABLE "staff_time_off_requests" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "organization_id" uuid NOT NULL,
  "membership_id" uuid NOT NULL,
  "starts_on" date NOT NULL,
  "ends_on" date NOT NULL,
  "reason" text,
  "status" text DEFAULT 'PENDING' NOT NULL,
  "reviewed_at" timestamp,
  "reviewed_by_user_id" uuid,
  "reviewed_by_name_snapshot" text,
  "review_note" text,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "staff_time_off_requests_date_range_check" CHECK ("ends_on" >= "starts_on"),
  CONSTRAINT "staff_time_off_requests_status_check" CHECK ("status" IN ('PENDING', 'APPROVED', 'DECLINED', 'CANCELLED')),
  CONSTRAINT "staff_time_off_requests_reason_check" CHECK ("reason" IS NULL OR char_length("reason") <= 500),
  CONSTRAINT "staff_time_off_requests_review_note_check" CHECK ("review_note" IS NULL OR char_length("review_note") <= 500)
);

ALTER TABLE "staff_time_off_requests"
ADD CONSTRAINT "staff_time_off_requests_organization_id_organizations_id_fk"
FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id")
ON DELETE cascade ON UPDATE no action;

ALTER TABLE "staff_time_off_requests"
ADD CONSTRAINT "staff_time_off_requests_membership_organization_fk"
FOREIGN KEY ("membership_id", "organization_id")
REFERENCES "public"."memberships"("id", "organization_id")
ON DELETE cascade ON UPDATE no action;

ALTER TABLE "staff_time_off_requests"
ADD CONSTRAINT "staff_time_off_requests_reviewed_by_user_id_users_id_fk"
FOREIGN KEY ("reviewed_by_user_id") REFERENCES "public"."users"("id")
ON DELETE set null ON UPDATE no action;

CREATE INDEX "staff_time_off_requests_organization_status_idx"
ON "staff_time_off_requests" ("organization_id", "status", "starts_on");

CREATE INDEX "staff_time_off_requests_membership_date_idx"
ON "staff_time_off_requests" ("membership_id", "starts_on", "ends_on");
