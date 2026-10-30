DO $$
BEGIN
  CREATE TYPE "receipt_print_format" AS ENUM ('THERMAL_80MM', 'FULL_PAGE');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE "organizations"
  ADD COLUMN IF NOT EXISTS "receipt_print_format" "receipt_print_format" DEFAULT 'THERMAL_80MM' NOT NULL,
  ADD COLUMN IF NOT EXISTS "receipt_footer_message" text;

ALTER TABLE "organizations"
  DROP CONSTRAINT IF EXISTS "organizations_receipt_footer_message_length_check";

ALTER TABLE "organizations"
  ADD CONSTRAINT "organizations_receipt_footer_message_length_check"
  CHECK (
    "receipt_footer_message" IS NULL
    OR char_length("receipt_footer_message") <= 160
  );
