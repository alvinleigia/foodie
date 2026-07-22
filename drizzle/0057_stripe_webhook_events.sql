CREATE TYPE "stripe_webhook_endpoint" AS ENUM ('PLATFORM', 'CONNECT');
CREATE TYPE "stripe_webhook_status" AS ENUM ('PROCESSING', 'SUCCEEDED', 'FAILED');

CREATE TABLE "stripe_webhook_events" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "endpoint" "stripe_webhook_endpoint" NOT NULL,
  "event_id" text NOT NULL,
  "event_type" text NOT NULL,
  "stripe_account_id" text,
  "status" "stripe_webhook_status" DEFAULT 'PROCESSING' NOT NULL,
  "attempt_count" integer DEFAULT 1 NOT NULL,
  "last_error" text,
  "received_at" timestamp with time zone DEFAULT now() NOT NULL,
  "processing_started_at" timestamp with time zone DEFAULT now() NOT NULL,
  "processed_at" timestamp with time zone,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "stripe_webhook_events_attempt_count_check" CHECK ("attempt_count" > 0)
);

CREATE UNIQUE INDEX "stripe_webhook_events_endpoint_event_unique"
ON "stripe_webhook_events" USING btree ("endpoint", "event_id");

CREATE INDEX "stripe_webhook_events_status_updated_idx"
ON "stripe_webhook_events" USING btree ("status", "updated_at");

CREATE INDEX "stripe_webhook_events_account_idx"
ON "stripe_webhook_events" USING btree ("stripe_account_id");
