CREATE TABLE "inventory_ingredient_movements" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "organization_id" uuid NOT NULL REFERENCES "organizations" ("id") ON DELETE CASCADE,
  "ingredient_id" uuid NOT NULL,
  "movement_type" text NOT NULL,
  "quantity_delta" numeric(14, 3) NOT NULL,
  "quantity_before" numeric(14, 3) NOT NULL,
  "quantity_after" numeric(14, 3) NOT NULL,
  "reason" text,
  "reference_type" text,
  "reference_id" uuid,
  "recorded_by_user_id" uuid REFERENCES "users" ("id") ON DELETE SET NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "inventory_ingredient_movements_ingredient_org_fk"
    FOREIGN KEY ("ingredient_id", "organization_id")
    REFERENCES "inventory_ingredients" ("id", "organization_id")
    ON DELETE RESTRICT,
  CONSTRAINT "inventory_ingredient_movements_type_check"
    CHECK ("movement_type" IN ('OPENING', 'RECEIPT', 'ADJUSTMENT', 'WASTE', 'SALE', 'RESTORE', 'STOCKTAKE')),
  CONSTRAINT "inventory_ingredient_movements_quantities_check"
    CHECK (
      "quantity_before" >= 0
      AND "quantity_after" >= 0
      AND "quantity_after" = "quantity_before" + "quantity_delta"
      AND ("quantity_delta" <> 0 OR "movement_type" = 'STOCKTAKE')
    ),
  CONSTRAINT "inventory_ingredient_movements_manual_reason_check"
    CHECK (
      "movement_type" NOT IN ('RECEIPT', 'ADJUSTMENT', 'WASTE', 'STOCKTAKE')
      OR (
        "reason" IS NOT NULL
        AND char_length(btrim("reason")) BETWEEN 2 AND 240
      )
    )
);

CREATE INDEX "inventory_ingredient_movements_org_created_idx"
  ON "inventory_ingredient_movements" ("organization_id", "created_at" DESC);

CREATE INDEX "inventory_ingredient_movements_ingredient_created_idx"
  ON "inventory_ingredient_movements" ("ingredient_id", "created_at" DESC);

CREATE INDEX "inventory_ingredient_movements_reference_idx"
  ON "inventory_ingredient_movements" ("reference_type", "reference_id");
