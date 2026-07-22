CREATE TYPE "cash_drawer_movement_type" AS ENUM ('PAID_IN', 'PAID_OUT');

CREATE UNIQUE INDEX "cash_drawer_sessions_id_organization_unique"
ON "cash_drawer_sessions" ("id", "organization_id");

CREATE TABLE "cash_drawer_movements" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "organization_id" uuid NOT NULL,
  "cash_drawer_session_id" uuid NOT NULL,
  "type" "cash_drawer_movement_type" NOT NULL,
  "amount" numeric(10, 2) NOT NULL,
  "currency" text NOT NULL,
  "reason" text NOT NULL,
  "note" text,
  "recorded_by_membership_id" uuid,
  "recorded_by_user_id" uuid,
  "created_at" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "cash_drawer_movements_amount_check"
    CHECK ("amount" > 0),
  CONSTRAINT "cash_drawer_movements_reason_check"
    CHECK (char_length(btrim("reason")) BETWEEN 1 AND 120),
  CONSTRAINT "cash_drawer_movements_note_check"
    CHECK ("note" IS NULL OR char_length("note") <= 500)
);

ALTER TABLE "cash_drawer_movements"
ADD CONSTRAINT "cash_drawer_movements_organization_id_organizations_id_fk"
FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id")
ON DELETE cascade ON UPDATE no action;

ALTER TABLE "cash_drawer_movements"
ADD CONSTRAINT "cash_drawer_movements_session_organization_fk"
FOREIGN KEY ("cash_drawer_session_id", "organization_id")
REFERENCES "public"."cash_drawer_sessions"("id", "organization_id")
ON DELETE cascade ON UPDATE no action;

ALTER TABLE "cash_drawer_movements"
ADD CONSTRAINT "cash_drawer_movements_recorded_by_membership_id_memberships_id_fk"
FOREIGN KEY ("recorded_by_membership_id") REFERENCES "public"."memberships"("id")
ON DELETE set null ON UPDATE no action;

ALTER TABLE "cash_drawer_movements"
ADD CONSTRAINT "cash_drawer_movements_recorded_by_user_id_users_id_fk"
FOREIGN KEY ("recorded_by_user_id") REFERENCES "public"."users"("id")
ON DELETE set null ON UPDATE no action;

CREATE INDEX "cash_drawer_movements_organization_created_idx"
ON "cash_drawer_movements" ("organization_id", "created_at");

CREATE INDEX "cash_drawer_movements_session_created_idx"
ON "cash_drawer_movements" ("cash_drawer_session_id", "created_at");
