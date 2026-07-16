ALTER TYPE "public"."order_item_status" ADD VALUE IF NOT EXISTS 'DELIVERED';
ALTER TYPE "public"."order_item_status" ADD VALUE IF NOT EXISTS 'CANCELLED';

ALTER TABLE "order_items"
  ADD COLUMN IF NOT EXISTS "delivered_at" timestamp,
  ADD COLUMN IF NOT EXISTS "cancelled_at" timestamp;
