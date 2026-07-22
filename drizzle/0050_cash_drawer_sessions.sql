CREATE TYPE "cash_drawer_session_status" AS ENUM ('OPEN', 'CLOSED');

CREATE TABLE "cash_drawer_sessions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "organization_id" uuid NOT NULL,
  "ordering_point_id" uuid NOT NULL,
  "opened_by_membership_id" uuid,
  "opened_by_user_id" uuid,
  "opening_float" numeric(10, 2) DEFAULT '0' NOT NULL,
  "currency" text NOT NULL,
  "status" "cash_drawer_session_status" DEFAULT 'OPEN' NOT NULL,
  "opened_at" timestamp DEFAULT now() NOT NULL,
  "closed_at" timestamp,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "cash_drawer_sessions_opening_float_check"
    CHECK ("opening_float" >= 0),
  CONSTRAINT "cash_drawer_sessions_closed_at_check"
    CHECK (("status" = 'OPEN' AND "closed_at" IS NULL) OR ("status" = 'CLOSED' AND "closed_at" IS NOT NULL))
);

ALTER TABLE "cash_drawer_sessions"
ADD CONSTRAINT "cash_drawer_sessions_organization_id_organizations_id_fk"
FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id")
ON DELETE cascade ON UPDATE no action;

ALTER TABLE "cash_drawer_sessions"
ADD CONSTRAINT "cash_drawer_sessions_ordering_point_id_ordering_points_id_fk"
FOREIGN KEY ("ordering_point_id") REFERENCES "public"."ordering_points"("id")
ON DELETE restrict ON UPDATE no action;

ALTER TABLE "cash_drawer_sessions"
ADD CONSTRAINT "cash_drawer_sessions_opened_by_membership_id_memberships_id_fk"
FOREIGN KEY ("opened_by_membership_id") REFERENCES "public"."memberships"("id")
ON DELETE set null ON UPDATE no action;

ALTER TABLE "cash_drawer_sessions"
ADD CONSTRAINT "cash_drawer_sessions_opened_by_user_id_users_id_fk"
FOREIGN KEY ("opened_by_user_id") REFERENCES "public"."users"("id")
ON DELETE set null ON UPDATE no action;

CREATE INDEX "cash_drawer_sessions_organization_status_idx"
ON "cash_drawer_sessions" ("organization_id", "status");

CREATE INDEX "cash_drawer_sessions_ordering_point_opened_idx"
ON "cash_drawer_sessions" ("ordering_point_id", "opened_at");

CREATE UNIQUE INDEX "cash_drawer_sessions_ordering_point_open_unique"
ON "cash_drawer_sessions" ("ordering_point_id")
WHERE "status" = 'OPEN';

ALTER TABLE "order_payments"
ADD COLUMN "cash_drawer_session_id" uuid;

ALTER TABLE "order_payments"
ADD CONSTRAINT "order_payments_cash_drawer_session_id_cash_drawer_sessions_id_fk"
FOREIGN KEY ("cash_drawer_session_id") REFERENCES "public"."cash_drawer_sessions"("id")
ON DELETE set null ON UPDATE no action;

CREATE INDEX "order_payments_cash_drawer_session_idx"
ON "order_payments" ("cash_drawer_session_id");
