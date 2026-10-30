ALTER TABLE "inventory_ingredient_movements"
  DROP CONSTRAINT "inventory_ingredient_movements_manual_reason_check";

ALTER TABLE "inventory_ingredient_movements"
  ADD CONSTRAINT "inventory_ingredient_movements_manual_reason_check"
  CHECK (
    "movement_type" NOT IN ('RECEIPT', 'ADJUSTMENT', 'WASTE', 'STOCKTAKE')
    OR (
      "reason" IS NOT NULL
      AND char_length(btrim("reason")) BETWEEN 2 AND 240
    )
  );
