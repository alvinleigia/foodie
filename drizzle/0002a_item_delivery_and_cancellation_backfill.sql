UPDATE "order_items" AS item
SET
  "status" = CASE
    WHEN parent."status" = 'DELIVERED' THEN 'DELIVERED'::"order_item_status"
    WHEN parent."status" = 'CANCELLED' THEN 'CANCELLED'::"order_item_status"
    ELSE item."status"
  END,
  "delivered_at" = CASE
    WHEN parent."status" = 'DELIVERED'
      THEN COALESCE(parent."delivered_at", parent."updated_at")
    ELSE item."delivered_at"
  END,
  "cancelled_at" = CASE
    WHEN parent."status" = 'CANCELLED'
      THEN COALESCE(parent."cancelled_at", parent."updated_at")
    ELSE item."cancelled_at"
  END
FROM "orders" AS parent
WHERE item."order_id" = parent."id";
