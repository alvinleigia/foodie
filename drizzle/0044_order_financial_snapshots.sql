ALTER TABLE "orders"
  ADD COLUMN "subtotal_amount_snapshot" numeric(10, 2),
  ADD COLUMN "discount_amount_snapshot" numeric(10, 2),
  ADD COLUMN "tax_amount_snapshot" numeric(10, 2),
  ADD COLUMN "charge_amount_snapshot" numeric(10, 2),
  ADD COLUMN "tip_amount_snapshot" numeric(10, 2),
  ADD COLUMN "final_total_amount_snapshot" numeric(10, 2),
  ADD COLUMN "financial_snapshot_currency" text,
  ADD COLUMN "financial_snapshot_at" timestamp;

ALTER TABLE "orders"
  ADD CONSTRAINT "orders_financial_snapshot_completeness_check"
    CHECK (
      (
        "subtotal_amount_snapshot" IS NULL
        AND "discount_amount_snapshot" IS NULL
        AND "tax_amount_snapshot" IS NULL
        AND "charge_amount_snapshot" IS NULL
        AND "tip_amount_snapshot" IS NULL
        AND "final_total_amount_snapshot" IS NULL
        AND "financial_snapshot_currency" IS NULL
        AND "financial_snapshot_at" IS NULL
      )
      OR
      (
        "subtotal_amount_snapshot" IS NOT NULL
        AND "discount_amount_snapshot" IS NOT NULL
        AND "tax_amount_snapshot" IS NOT NULL
        AND "charge_amount_snapshot" IS NOT NULL
        AND "tip_amount_snapshot" IS NOT NULL
        AND "final_total_amount_snapshot" IS NOT NULL
        AND "financial_snapshot_currency" IS NOT NULL
      )
    ),
  ADD CONSTRAINT "orders_financial_snapshot_amounts_check"
    CHECK (
      "subtotal_amount_snapshot" IS NULL
      OR (
        "subtotal_amount_snapshot" >= 0
        AND "discount_amount_snapshot" >= 0
        AND "discount_amount_snapshot" <= "subtotal_amount_snapshot"
        AND "tax_amount_snapshot" >= 0
        AND "charge_amount_snapshot" >= 0
        AND "tip_amount_snapshot" >= 0
        AND "final_total_amount_snapshot" =
          "subtotal_amount_snapshot"
          - "discount_amount_snapshot"
          + "tax_amount_snapshot"
          + "charge_amount_snapshot"
          + "tip_amount_snapshot"
      )
    ),
  ADD CONSTRAINT "orders_financial_snapshot_currency_check"
    CHECK (
      "financial_snapshot_currency" IS NULL
      OR (
        char_length("financial_snapshot_currency") = 3
        AND "financial_snapshot_currency" = upper("financial_snapshot_currency")
      )
    );

CREATE FUNCTION "prevent_finalized_order_financial_snapshot_update"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF OLD."financial_snapshot_at" IS NOT NULL AND ROW(
    NEW."subtotal_amount_snapshot",
    NEW."discount_amount_snapshot",
    NEW."tax_amount_snapshot",
    NEW."charge_amount_snapshot",
    NEW."tip_amount_snapshot",
    NEW."final_total_amount_snapshot",
    NEW."financial_snapshot_currency",
    NEW."financial_snapshot_at"
  ) IS DISTINCT FROM ROW(
    OLD."subtotal_amount_snapshot",
    OLD."discount_amount_snapshot",
    OLD."tax_amount_snapshot",
    OLD."charge_amount_snapshot",
    OLD."tip_amount_snapshot",
    OLD."final_total_amount_snapshot",
    OLD."financial_snapshot_currency",
    OLD."financial_snapshot_at"
  ) THEN
    RAISE EXCEPTION 'Finalized order financial snapshots cannot be changed.';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER "orders_financial_snapshot_immutable"
BEFORE UPDATE OF
  "subtotal_amount_snapshot",
  "discount_amount_snapshot",
  "tax_amount_snapshot",
  "charge_amount_snapshot",
  "tip_amount_snapshot",
  "final_total_amount_snapshot",
  "financial_snapshot_currency",
  "financial_snapshot_at"
ON "orders"
FOR EACH ROW
EXECUTE FUNCTION "prevent_finalized_order_financial_snapshot_update"();
