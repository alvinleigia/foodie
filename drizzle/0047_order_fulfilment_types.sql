CREATE TYPE "order_fulfilment_type" AS ENUM (
  'DINE_IN',
  'TAKEAWAY',
  'COLLECTION',
  'DELIVERY'
);

ALTER TABLE "orders"
ADD COLUMN "fulfilment_type" "order_fulfilment_type" DEFAULT 'COLLECTION' NOT NULL;
