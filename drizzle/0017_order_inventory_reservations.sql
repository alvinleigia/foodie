ALTER TABLE "order_items"
  ADD COLUMN IF NOT EXISTS "inventory_reserved_at" timestamp;
