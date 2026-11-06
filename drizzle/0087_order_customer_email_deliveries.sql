CREATE TYPE "order_customer_email_type" AS ENUM (
  'ORDER_CONFIRMATION',
  'PAYMENT_RECEIPT',
  'CANCELLATION',
  'REFUND'
);

CREATE TYPE "order_customer_email_status" AS ENUM (
  'PENDING',
  'PROCESSING',
  'SENT',
  'FAILED'
);

CREATE TABLE "order_customer_email_deliveries" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "organization_id" uuid NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
  "order_id" uuid NOT NULL REFERENCES "orders"("id") ON DELETE CASCADE,
  "type" "order_customer_email_type" NOT NULL,
  "event_key" text NOT NULL,
  "recipient_email" text NOT NULL,
  "subject" text NOT NULL,
  "text_body" text NOT NULL,
  "html_body" text NOT NULL,
  "status" "order_customer_email_status" DEFAULT 'PENDING' NOT NULL,
  "attempt_count" integer DEFAULT 0 NOT NULL,
  "last_attempt_at" timestamp,
  "last_error" text,
  "sent_at" timestamp,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "order_customer_email_deliveries_attempt_count_check"
    CHECK ("attempt_count" >= 0)
);

CREATE UNIQUE INDEX "order_customer_email_deliveries_event_unique"
  ON "order_customer_email_deliveries" ("organization_id", "event_key");

CREATE INDEX "order_customer_email_deliveries_order_idx"
  ON "order_customer_email_deliveries" ("order_id", "created_at");

CREATE INDEX "order_customer_email_deliveries_status_idx"
  ON "order_customer_email_deliveries" ("status", "updated_at");
