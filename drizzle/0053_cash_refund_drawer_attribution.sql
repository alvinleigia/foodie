ALTER TABLE "order_refunds"
ADD COLUMN "cash_drawer_session_id" uuid;

ALTER TABLE "order_refunds"
ADD CONSTRAINT "order_refunds_cash_drawer_session_organization_fk"
FOREIGN KEY ("cash_drawer_session_id", "organization_id")
REFERENCES "public"."cash_drawer_sessions"("id", "organization_id")
ON DELETE no action ON UPDATE no action;

CREATE INDEX "order_refunds_cash_drawer_session_idx"
ON "order_refunds" ("cash_drawer_session_id");
