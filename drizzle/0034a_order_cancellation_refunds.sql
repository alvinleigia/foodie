CREATE TYPE "refund_status" AS ENUM (
  'PENDING',
  'SUCCEEDED',
  'FAILED'
);

ALTER TABLE "organizations"
  ADD COLUMN "customer_cancellation_fee_bps" integer DEFAULT 0 NOT NULL;

ALTER TABLE "organizations"
  ADD CONSTRAINT "organizations_customer_cancellation_fee_bps_check"
  CHECK (
    "customer_cancellation_fee_bps" >= 0
    AND "customer_cancellation_fee_bps" <= 10000
  );

ALTER TABLE "orders"
  ADD COLUMN "customer_cancellation_fee_bps_snapshot" integer DEFAULT 0 NOT NULL,
  ADD COLUMN "cancellation_fee_bps_applied" integer,
  ADD COLUMN "cancellation_fee_amount" numeric(10, 2),
  ADD COLUMN "refund_amount" numeric(10, 2);

ALTER TABLE "orders"
  ADD CONSTRAINT "orders_customer_cancellation_fee_bps_snapshot_check"
  CHECK (
    "customer_cancellation_fee_bps_snapshot" >= 0
    AND "customer_cancellation_fee_bps_snapshot" <= 10000
  ),
  ADD CONSTRAINT "orders_cancellation_fee_bps_applied_check"
  CHECK (
    "cancellation_fee_bps_applied" IS NULL
    OR (
      "cancellation_fee_bps_applied" >= 0
      AND "cancellation_fee_bps_applied" <= "customer_cancellation_fee_bps_snapshot"
    )
  ),
  ADD CONSTRAINT "orders_cancellation_amounts_check"
  CHECK (
    (
      "cancellation_fee_amount" IS NULL
      AND "refund_amount" IS NULL
    )
    OR (
      "cancellation_fee_amount" IS NOT NULL
      AND "cancellation_fee_amount" >= 0
      AND "refund_amount" IS NOT NULL
      AND "refund_amount" >= 0
      AND "payment_amount" IS NOT NULL
      AND "cancellation_fee_amount" + "refund_amount" = "payment_amount"
    )
  );

CREATE TABLE "order_cancellations" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "organization_id" uuid NOT NULL,
  "order_id" uuid NOT NULL,
  "actor_type" "cancelled_by_type" NOT NULL,
  "actor_user_id" uuid,
  "reason" text,
  "disclosed_fee_bps" integer NOT NULL,
  "applied_fee_bps" integer NOT NULL,
  "gross_amount" numeric(10, 2),
  "fee_amount" numeric(10, 2),
  "refund_amount" numeric(10, 2),
  "currency" text,
  "override_reason" text,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "order_cancellations_organization_id_organizations_id_fk"
    FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id")
    ON DELETE cascade ON UPDATE no action,
  CONSTRAINT "order_cancellations_order_id_orders_id_fk"
    FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id")
    ON DELETE cascade ON UPDATE no action,
  CONSTRAINT "order_cancellations_actor_user_id_users_id_fk"
    FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id")
    ON DELETE set null ON UPDATE no action,
  CONSTRAINT "order_cancellations_fee_bps_check"
    CHECK (
      "disclosed_fee_bps" >= 0
      AND "disclosed_fee_bps" <= 10000
      AND "applied_fee_bps" >= 0
      AND "applied_fee_bps" <= "disclosed_fee_bps"
    ),
  CONSTRAINT "order_cancellations_amounts_check"
    CHECK (
      (
        "gross_amount" IS NULL
        AND "fee_amount" IS NULL
        AND "refund_amount" IS NULL
        AND "currency" IS NULL
      )
      OR (
        "gross_amount" IS NOT NULL
        AND "gross_amount" >= 0
        AND "fee_amount" IS NOT NULL
        AND "fee_amount" >= 0
        AND "refund_amount" IS NOT NULL
        AND "refund_amount" >= 0
        AND "currency" IS NOT NULL
        AND "fee_amount" + "refund_amount" = "gross_amount"
      )
    )
);

CREATE UNIQUE INDEX "order_cancellations_order_unique"
  ON "order_cancellations" USING btree ("order_id");
CREATE INDEX "order_cancellations_organization_created_idx"
  ON "order_cancellations" USING btree ("organization_id", "created_at");

CREATE TABLE "order_refunds" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "organization_id" uuid NOT NULL,
  "order_id" uuid NOT NULL,
  "cancellation_id" uuid NOT NULL,
  "provider" "payment_provider" DEFAULT 'STRIPE' NOT NULL,
  "status" "refund_status" DEFAULT 'PENDING' NOT NULL,
  "amount" numeric(10, 2) NOT NULL,
  "currency" text NOT NULL,
  "stripe_refund_id" text,
  "idempotency_key" text NOT NULL,
  "failure_reason" text,
  "requested_by_user_id" uuid,
  "requested_at" timestamp DEFAULT now() NOT NULL,
  "processed_at" timestamp,
  "updated_at" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "order_refunds_organization_id_organizations_id_fk"
    FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id")
    ON DELETE cascade ON UPDATE no action,
  CONSTRAINT "order_refunds_order_id_orders_id_fk"
    FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id")
    ON DELETE cascade ON UPDATE no action,
  CONSTRAINT "order_refunds_cancellation_id_order_cancellations_id_fk"
    FOREIGN KEY ("cancellation_id") REFERENCES "public"."order_cancellations"("id")
    ON DELETE cascade ON UPDATE no action,
  CONSTRAINT "order_refunds_requested_by_user_id_users_id_fk"
    FOREIGN KEY ("requested_by_user_id") REFERENCES "public"."users"("id")
    ON DELETE set null ON UPDATE no action,
  CONSTRAINT "order_refunds_amount_check" CHECK ("amount" > 0)
);

CREATE INDEX "order_refunds_order_requested_idx"
  ON "order_refunds" USING btree ("order_id", "requested_at");
CREATE UNIQUE INDEX "order_refunds_stripe_refund_unique"
  ON "order_refunds" USING btree ("stripe_refund_id");
CREATE UNIQUE INDEX "order_refunds_idempotency_key_unique"
  ON "order_refunds" USING btree ("idempotency_key");
CREATE UNIQUE INDEX "order_refunds_one_pending_per_cancellation_unique"
  ON "order_refunds" USING btree ("cancellation_id")
  WHERE "status" = 'PENDING';
