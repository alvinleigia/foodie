CREATE UNIQUE INDEX "inventory_movements_id_organization_unique"
  ON "inventory_ingredient_movements" ("id", "organization_id");

CREATE TABLE "inventory_suppliers" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "organization_id" uuid NOT NULL REFERENCES "organizations" ("id") ON DELETE CASCADE,
  "name" text NOT NULL,
  "contact_name" text,
  "email" text,
  "phone" text,
  "account_reference" text,
  "notes" text,
  "is_active" boolean DEFAULT true NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "inventory_suppliers_name_check"
    CHECK (char_length(btrim("name")) BETWEEN 1 AND 120),
  CONSTRAINT "inventory_suppliers_contact_check"
    CHECK (
      ("contact_name" IS NULL OR char_length(btrim("contact_name")) BETWEEN 1 AND 120)
      AND ("email" IS NULL OR char_length(btrim("email")) BETWEEN 3 AND 254)
      AND ("phone" IS NULL OR char_length(btrim("phone")) BETWEEN 3 AND 40)
      AND ("account_reference" IS NULL OR char_length(btrim("account_reference")) BETWEEN 1 AND 80)
      AND ("notes" IS NULL OR char_length(btrim("notes")) BETWEEN 1 AND 500)
    )
);

CREATE UNIQUE INDEX "inventory_suppliers_id_organization_unique"
  ON "inventory_suppliers" ("id", "organization_id");

CREATE UNIQUE INDEX "inventory_suppliers_organization_name_unique"
  ON "inventory_suppliers" ("organization_id", lower("name"));

CREATE INDEX "inventory_suppliers_organization_active_idx"
  ON "inventory_suppliers" ("organization_id", "is_active", "name");

CREATE TABLE "inventory_purchase_order_counters" (
  "organization_id" uuid PRIMARY KEY REFERENCES "organizations" ("id") ON DELETE CASCADE,
  "last_number" integer DEFAULT 0 NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "inventory_purchase_order_counters_number_check"
    CHECK ("last_number" >= 0)
);

CREATE TABLE "inventory_purchase_orders" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "organization_id" uuid NOT NULL REFERENCES "organizations" ("id") ON DELETE CASCADE,
  "supplier_id" uuid NOT NULL,
  "order_number" integer NOT NULL,
  "status" text DEFAULT 'DRAFT' NOT NULL,
  "currency" text NOT NULL,
  "expected_on" date,
  "notes" text,
  "created_by_user_id" uuid REFERENCES "users" ("id") ON DELETE SET NULL,
  "ordered_at" timestamp,
  "received_at" timestamp,
  "cancelled_at" timestamp,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "inventory_purchase_orders_supplier_org_fk"
    FOREIGN KEY ("supplier_id", "organization_id")
    REFERENCES "inventory_suppliers" ("id", "organization_id")
    ON DELETE RESTRICT,
  CONSTRAINT "inventory_purchase_orders_number_check" CHECK ("order_number" > 0),
  CONSTRAINT "inventory_purchase_orders_status_check"
    CHECK ("status" IN ('DRAFT', 'ORDERED', 'PARTIALLY_RECEIVED', 'RECEIVED', 'CANCELLED')),
  CONSTRAINT "inventory_purchase_orders_currency_check"
    CHECK ("currency" ~ '^[A-Z]{3}$'),
  CONSTRAINT "inventory_purchase_orders_notes_check"
    CHECK ("notes" IS NULL OR char_length(btrim("notes")) BETWEEN 1 AND 500),
  CONSTRAINT "inventory_purchase_orders_dates_check"
    CHECK (
      ("status" = 'DRAFT' AND "ordered_at" IS NULL AND "received_at" IS NULL AND "cancelled_at" IS NULL)
      OR ("status" IN ('ORDERED', 'PARTIALLY_RECEIVED') AND "ordered_at" IS NOT NULL AND "received_at" IS NULL AND "cancelled_at" IS NULL)
      OR ("status" = 'RECEIVED' AND "ordered_at" IS NOT NULL AND "received_at" IS NOT NULL AND "cancelled_at" IS NULL)
      OR ("status" = 'CANCELLED' AND "received_at" IS NULL AND "cancelled_at" IS NOT NULL)
    )
);

CREATE UNIQUE INDEX "inventory_purchase_orders_id_organization_unique"
  ON "inventory_purchase_orders" ("id", "organization_id");

CREATE UNIQUE INDEX "inventory_purchase_orders_org_number_unique"
  ON "inventory_purchase_orders" ("organization_id", "order_number");

CREATE INDEX "inventory_purchase_orders_org_status_created_idx"
  ON "inventory_purchase_orders" ("organization_id", "status", "created_at" DESC);

CREATE TABLE "inventory_purchase_order_items" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "organization_id" uuid NOT NULL REFERENCES "organizations" ("id") ON DELETE CASCADE,
  "purchase_order_id" uuid NOT NULL,
  "ingredient_id" uuid NOT NULL,
  "ordered_quantity" numeric(14, 3) NOT NULL,
  "received_quantity" numeric(14, 3) DEFAULT 0 NOT NULL,
  "unit_cost" numeric(14, 4),
  "notes" text,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "inventory_po_items_order_org_fk"
    FOREIGN KEY ("purchase_order_id", "organization_id")
    REFERENCES "inventory_purchase_orders" ("id", "organization_id")
    ON DELETE CASCADE,
  CONSTRAINT "inventory_po_items_ingredient_org_fk"
    FOREIGN KEY ("ingredient_id", "organization_id")
    REFERENCES "inventory_ingredients" ("id", "organization_id")
    ON DELETE RESTRICT,
  CONSTRAINT "inventory_po_items_quantities_check"
    CHECK (
      "ordered_quantity" > 0
      AND "received_quantity" >= 0
      AND "received_quantity" <= "ordered_quantity"
      AND ("unit_cost" IS NULL OR "unit_cost" >= 0)
    ),
  CONSTRAINT "inventory_po_items_notes_check"
    CHECK ("notes" IS NULL OR char_length(btrim("notes")) BETWEEN 1 AND 240)
);

CREATE UNIQUE INDEX "inventory_po_items_id_organization_unique"
  ON "inventory_purchase_order_items" ("id", "organization_id");

CREATE UNIQUE INDEX "inventory_po_items_order_ingredient_unique"
  ON "inventory_purchase_order_items" ("purchase_order_id", "ingredient_id");

CREATE INDEX "inventory_po_items_organization_order_idx"
  ON "inventory_purchase_order_items" ("organization_id", "purchase_order_id");

CREATE TABLE "inventory_purchase_order_receipts" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "organization_id" uuid NOT NULL REFERENCES "organizations" ("id") ON DELETE CASCADE,
  "purchase_order_id" uuid NOT NULL,
  "idempotency_key" uuid NOT NULL,
  "received_by_user_id" uuid REFERENCES "users" ("id") ON DELETE SET NULL,
  "notes" text,
  "created_at" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "inventory_po_receipts_order_org_fk"
    FOREIGN KEY ("purchase_order_id", "organization_id")
    REFERENCES "inventory_purchase_orders" ("id", "organization_id")
    ON DELETE RESTRICT,
  CONSTRAINT "inventory_po_receipts_notes_check"
    CHECK ("notes" IS NULL OR char_length(btrim("notes")) BETWEEN 1 AND 500)
);

CREATE UNIQUE INDEX "inventory_po_receipts_id_organization_unique"
  ON "inventory_purchase_order_receipts" ("id", "organization_id");

CREATE UNIQUE INDEX "inventory_po_receipts_org_idempotency_unique"
  ON "inventory_purchase_order_receipts" ("organization_id", "idempotency_key");

CREATE INDEX "inventory_po_receipts_org_order_created_idx"
  ON "inventory_purchase_order_receipts" ("organization_id", "purchase_order_id", "created_at" DESC);

CREATE TABLE "inventory_purchase_order_receipt_items" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "organization_id" uuid NOT NULL REFERENCES "organizations" ("id") ON DELETE CASCADE,
  "receipt_id" uuid NOT NULL,
  "purchase_order_item_id" uuid NOT NULL,
  "ingredient_id" uuid NOT NULL,
  "movement_id" uuid NOT NULL,
  "quantity" numeric(14, 3) NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "inventory_po_receipt_items_receipt_org_fk"
    FOREIGN KEY ("receipt_id", "organization_id")
    REFERENCES "inventory_purchase_order_receipts" ("id", "organization_id")
    ON DELETE CASCADE,
  CONSTRAINT "inventory_po_receipt_items_order_item_org_fk"
    FOREIGN KEY ("purchase_order_item_id", "organization_id")
    REFERENCES "inventory_purchase_order_items" ("id", "organization_id")
    ON DELETE RESTRICT,
  CONSTRAINT "inventory_po_receipt_items_ingredient_org_fk"
    FOREIGN KEY ("ingredient_id", "organization_id")
    REFERENCES "inventory_ingredients" ("id", "organization_id")
    ON DELETE RESTRICT,
  CONSTRAINT "inventory_po_receipt_items_movement_org_fk"
    FOREIGN KEY ("movement_id", "organization_id")
    REFERENCES "inventory_ingredient_movements" ("id", "organization_id")
    ON DELETE RESTRICT,
  CONSTRAINT "inventory_po_receipt_items_quantity_check" CHECK ("quantity" > 0)
);

CREATE UNIQUE INDEX "inventory_po_receipt_items_receipt_item_unique"
  ON "inventory_purchase_order_receipt_items" ("receipt_id", "purchase_order_item_id");

CREATE INDEX "inventory_po_receipt_items_org_receipt_idx"
  ON "inventory_purchase_order_receipt_items" ("organization_id", "receipt_id");
