CREATE TABLE IF NOT EXISTS "rate_limit_windows" (
  "key_hash" text PRIMARY KEY NOT NULL,
  "request_count" integer NOT NULL,
  "reset_at" timestamp with time zone NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "rate_limit_windows_request_count_check" CHECK ("request_count" > 0)
);

CREATE INDEX IF NOT EXISTS "rate_limit_windows_reset_at_idx"
ON "rate_limit_windows" USING btree ("reset_at");
