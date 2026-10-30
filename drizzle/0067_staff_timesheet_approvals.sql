ALTER TABLE "staff_shifts"
ADD COLUMN "approval_status" text DEFAULT 'PENDING' NOT NULL,
ADD COLUMN "approved_at" timestamp,
ADD COLUMN "approved_by_user_id" uuid,
ADD COLUMN "approved_by_name_snapshot" text;

ALTER TABLE "staff_shifts"
ADD CONSTRAINT "staff_shifts_approved_by_user_id_users_id_fk"
FOREIGN KEY ("approved_by_user_id") REFERENCES "public"."users"("id")
ON DELETE set null ON UPDATE no action;

CREATE INDEX "staff_shifts_organization_approval_idx"
ON "staff_shifts" ("organization_id", "approval_status", "clocked_in_at");

ALTER TABLE "staff_shifts"
ADD CONSTRAINT "staff_shifts_approval_status_check"
CHECK ("approval_status" IN ('PENDING', 'APPROVED'));

ALTER TABLE "staff_shifts"
ADD CONSTRAINT "staff_shifts_approval_metadata_check"
CHECK (
  (
    "approval_status" = 'PENDING'
    AND "approved_at" IS NULL
    AND "approved_by_user_id" IS NULL
    AND "approved_by_name_snapshot" IS NULL
  )
  OR
  (
    "approval_status" = 'APPROVED'
    AND "clocked_out_at" IS NOT NULL
    AND "approved_at" IS NOT NULL
    AND char_length(btrim("approved_by_name_snapshot")) BETWEEN 1 AND 120
  )
);
