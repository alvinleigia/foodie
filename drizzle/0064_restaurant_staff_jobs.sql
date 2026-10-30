CREATE UNIQUE INDEX "memberships_id_organization_unique"
ON "memberships" ("id", "organization_id");

CREATE TABLE "restaurant_jobs" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "organization_id" uuid NOT NULL,
  "name" text NOT NULL,
  "description" text,
  "permissions" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "sort_order" integer DEFAULT 0 NOT NULL,
  "is_active" boolean DEFAULT true NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "restaurant_jobs_name_check"
    CHECK (char_length(btrim("name")) BETWEEN 1 AND 80),
  CONSTRAINT "restaurant_jobs_description_check"
    CHECK ("description" IS NULL OR char_length("description") <= 240),
  CONSTRAINT "restaurant_jobs_permissions_check"
    CHECK (jsonb_typeof("permissions") = 'array'),
  CONSTRAINT "restaurant_jobs_sort_order_check"
    CHECK ("sort_order" >= 0)
);

ALTER TABLE "restaurant_jobs"
ADD CONSTRAINT "restaurant_jobs_organization_id_organizations_id_fk"
FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id")
ON DELETE cascade ON UPDATE no action;

CREATE UNIQUE INDEX "restaurant_jobs_id_organization_unique"
ON "restaurant_jobs" ("id", "organization_id");

CREATE UNIQUE INDEX "restaurant_jobs_organization_name_unique"
ON "restaurant_jobs" ("organization_id", lower("name"));

CREATE INDEX "restaurant_jobs_organization_active_idx"
ON "restaurant_jobs" ("organization_id", "is_active", "sort_order");

CREATE TABLE "staff_job_assignments" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "organization_id" uuid NOT NULL,
  "membership_id" uuid NOT NULL,
  "job_id" uuid NOT NULL,
  "is_primary" boolean DEFAULT false NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);

ALTER TABLE "staff_job_assignments"
ADD CONSTRAINT "staff_job_assignments_organization_id_organizations_id_fk"
FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id")
ON DELETE cascade ON UPDATE no action;

ALTER TABLE "staff_job_assignments"
ADD CONSTRAINT "staff_job_assignments_membership_organization_fk"
FOREIGN KEY ("membership_id", "organization_id")
REFERENCES "public"."memberships"("id", "organization_id")
ON DELETE cascade ON UPDATE no action;

ALTER TABLE "staff_job_assignments"
ADD CONSTRAINT "staff_job_assignments_job_organization_fk"
FOREIGN KEY ("job_id", "organization_id")
REFERENCES "public"."restaurant_jobs"("id", "organization_id")
ON DELETE cascade ON UPDATE no action;

CREATE UNIQUE INDEX "staff_job_assignments_membership_job_unique"
ON "staff_job_assignments" ("membership_id", "job_id");

CREATE UNIQUE INDEX "staff_job_assignments_primary_unique"
ON "staff_job_assignments" ("membership_id")
WHERE "is_primary" = true;

CREATE INDEX "staff_job_assignments_organization_idx"
ON "staff_job_assignments" ("organization_id", "membership_id");
