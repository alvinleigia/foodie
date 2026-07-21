ALTER TABLE "orders"
ADD COLUMN "requested_fulfilment_at" timestamp,
ADD COLUMN "promised_fulfilment_at" timestamp;

CREATE INDEX "orders_restaurant_promised_fulfilment_idx"
ON "orders" ("organization_id", "promised_fulfilment_at");
