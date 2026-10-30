ALTER TABLE "staff_scheduled_shifts"
ALTER COLUMN "membership_id" DROP NOT NULL;

CREATE TABLE "staff_shift_cover_requests" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "organization_id" uuid NOT NULL,
  "scheduled_shift_id" uuid NOT NULL,
  "requested_by_membership_id" uuid,
  "kind" text NOT NULL,
  "status" text DEFAULT 'OPEN' NOT NULL,
  "reason" text,
  "reviewed_at" timestamp,
  "reviewed_by_user_id" uuid,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "staff_shift_cover_requests_kind_check" CHECK ("kind" IN ('OPEN_SHIFT', 'COVER_REQUEST')),
  CONSTRAINT "staff_shift_cover_requests_status_check" CHECK ("status" IN ('OPEN', 'FILLED', 'CANCELLED')),
  CONSTRAINT "staff_shift_cover_requests_reason_check" CHECK ("reason" IS NULL OR char_length("reason") <= 500)
);

ALTER TABLE "staff_shift_cover_requests"
ADD CONSTRAINT "staff_shift_cover_requests_organization_id_organizations_id_fk"
FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id")
ON DELETE cascade ON UPDATE no action;

ALTER TABLE "staff_shift_cover_requests"
ADD CONSTRAINT "staff_shift_cover_requests_shift_organization_fk"
FOREIGN KEY ("scheduled_shift_id", "organization_id")
REFERENCES "public"."staff_scheduled_shifts"("id", "organization_id")
ON DELETE cascade ON UPDATE no action;

ALTER TABLE "staff_shift_cover_requests"
ADD CONSTRAINT "staff_shift_cover_requests_requester_organization_fk"
FOREIGN KEY ("requested_by_membership_id", "organization_id")
REFERENCES "public"."memberships"("id", "organization_id")
ON DELETE restrict ON UPDATE no action;

ALTER TABLE "staff_shift_cover_requests"
ADD CONSTRAINT "staff_shift_cover_requests_reviewed_by_user_id_users_id_fk"
FOREIGN KEY ("reviewed_by_user_id") REFERENCES "public"."users"("id")
ON DELETE set null ON UPDATE no action;

CREATE UNIQUE INDEX "staff_shift_cover_requests_open_shift_unique"
ON "staff_shift_cover_requests" ("scheduled_shift_id")
WHERE "status" = 'OPEN';

CREATE UNIQUE INDEX "staff_shift_cover_requests_id_organization_unique"
ON "staff_shift_cover_requests" ("id", "organization_id");

CREATE INDEX "staff_shift_cover_requests_organization_status_idx"
ON "staff_shift_cover_requests" ("organization_id", "status", "created_at");

CREATE TABLE "staff_shift_cover_claims" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "organization_id" uuid NOT NULL,
  "request_id" uuid NOT NULL,
  "membership_id" uuid NOT NULL,
  "note" text,
  "status" text DEFAULT 'PENDING' NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "staff_shift_cover_claims_status_check" CHECK ("status" IN ('PENDING', 'APPROVED', 'DECLINED', 'WITHDRAWN')),
  CONSTRAINT "staff_shift_cover_claims_note_check" CHECK ("note" IS NULL OR char_length("note") <= 500)
);

ALTER TABLE "staff_shift_cover_claims"
ADD CONSTRAINT "staff_shift_cover_claims_organization_id_organizations_id_fk"
FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id")
ON DELETE cascade ON UPDATE no action;

ALTER TABLE "staff_shift_cover_claims"
ADD CONSTRAINT "staff_shift_cover_claims_request_organization_fk"
FOREIGN KEY ("request_id", "organization_id")
REFERENCES "public"."staff_shift_cover_requests"("id", "organization_id")
ON DELETE cascade ON UPDATE no action;

ALTER TABLE "staff_shift_cover_claims"
ADD CONSTRAINT "staff_shift_cover_claims_membership_organization_fk"
FOREIGN KEY ("membership_id", "organization_id")
REFERENCES "public"."memberships"("id", "organization_id")
ON DELETE cascade ON UPDATE no action;

CREATE UNIQUE INDEX "staff_shift_cover_claims_request_member_unique"
ON "staff_shift_cover_claims" ("request_id", "membership_id");

CREATE INDEX "staff_shift_cover_claims_organization_status_idx"
ON "staff_shift_cover_claims" ("organization_id", "status");
