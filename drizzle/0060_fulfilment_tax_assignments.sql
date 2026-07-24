CREATE TABLE "menu_item_fulfilment_tax_assignments" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "organization_id" uuid NOT NULL,
  "menu_item_id" uuid NOT NULL,
  "fulfilment_type" "order_fulfilment_type" NOT NULL,
  "tax_definition_id" uuid NOT NULL,
  "sort_order" integer DEFAULT 0 NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "menu_item_fulfilment_taxes_sort_order_check"
    CHECK ("sort_order" >= 0)
);

ALTER TABLE "menu_item_fulfilment_tax_assignments"
ADD CONSTRAINT "menu_item_fulfilment_taxes_org_fk"
FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id")
ON DELETE cascade ON UPDATE no action;

ALTER TABLE "menu_item_fulfilment_tax_assignments"
ADD CONSTRAINT "menu_item_fulfilment_taxes_item_org_fk"
FOREIGN KEY ("menu_item_id", "organization_id")
REFERENCES "public"."menu_items"("id", "organization_id")
ON DELETE cascade ON UPDATE no action;

ALTER TABLE "menu_item_fulfilment_tax_assignments"
ADD CONSTRAINT "menu_item_fulfilment_taxes_definition_org_fk"
FOREIGN KEY ("tax_definition_id", "organization_id")
REFERENCES "public"."organization_tax_definitions"("id", "organization_id")
ON DELETE cascade ON UPDATE no action;

CREATE UNIQUE INDEX "menu_item_fulfilment_taxes_item_type_def_unique"
ON "menu_item_fulfilment_tax_assignments" (
  "menu_item_id",
  "fulfilment_type",
  "tax_definition_id"
);

CREATE INDEX "menu_item_fulfilment_taxes_org_item_type_idx"
ON "menu_item_fulfilment_tax_assignments" (
  "organization_id",
  "menu_item_id",
  "fulfilment_type",
  "sort_order"
);
