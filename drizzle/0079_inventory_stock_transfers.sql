ALTER TABLE inventory_ingredient_movements
  DROP CONSTRAINT inventory_ingredient_movements_type_check;

ALTER TABLE inventory_ingredient_movements
  ADD CONSTRAINT inventory_ingredient_movements_type_check
  CHECK (movement_type IN (
    'OPENING',
    'RECEIPT',
    'ADJUSTMENT',
    'WASTE',
    'SALE',
    'RESTORE',
    'STOCKTAKE',
    'TRANSFER_OUT',
    'TRANSFER_IN'
  ));

CREATE TABLE inventory_stock_transfer_counters (
  organization_id uuid PRIMARY KEY REFERENCES organizations(id) ON DELETE CASCADE,
  last_number integer NOT NULL DEFAULT 0,
  updated_at timestamp NOT NULL DEFAULT now(),
  CONSTRAINT inventory_stock_transfer_counters_number_check CHECK (last_number >= 0)
);

CREATE TABLE inventory_stock_transfers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  destination_organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  transfer_number integer NOT NULL,
  status text NOT NULL DEFAULT 'DRAFT',
  notes text,
  created_by_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  sent_by_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  received_by_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  sent_at timestamp,
  received_at timestamp,
  cancelled_at timestamp,
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now(),
  CONSTRAINT inventory_stock_transfers_restaurants_check CHECK (source_organization_id <> destination_organization_id),
  CONSTRAINT inventory_stock_transfers_number_check CHECK (transfer_number > 0),
  CONSTRAINT inventory_stock_transfers_status_check CHECK (status IN ('DRAFT', 'IN_TRANSIT', 'RECEIVED', 'CANCELLED')),
  CONSTRAINT inventory_stock_transfers_notes_check CHECK (notes IS NULL OR char_length(btrim(notes)) BETWEEN 1 AND 500),
  CONSTRAINT inventory_stock_transfers_dates_check CHECK (
    (status = 'DRAFT' AND sent_at IS NULL AND received_at IS NULL AND cancelled_at IS NULL)
    OR (status = 'IN_TRANSIT' AND sent_at IS NOT NULL AND received_at IS NULL AND cancelled_at IS NULL)
    OR (status = 'RECEIVED' AND sent_at IS NOT NULL AND received_at IS NOT NULL AND cancelled_at IS NULL)
    OR (status = 'CANCELLED' AND sent_at IS NULL AND received_at IS NULL AND cancelled_at IS NOT NULL)
  ),
  CONSTRAINT inventory_stock_transfers_id_scope_unique UNIQUE (id, source_organization_id, destination_organization_id),
  CONSTRAINT inventory_stock_transfers_source_number_unique UNIQUE (source_organization_id, transfer_number)
);

CREATE INDEX inventory_stock_transfers_source_status_created_idx
  ON inventory_stock_transfers(source_organization_id, status, created_at);
CREATE INDEX inventory_stock_transfers_destination_status_created_idx
  ON inventory_stock_transfers(destination_organization_id, status, created_at);

CREATE TABLE inventory_stock_transfer_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  transfer_id uuid NOT NULL,
  source_organization_id uuid NOT NULL,
  destination_organization_id uuid NOT NULL,
  source_ingredient_id uuid NOT NULL,
  destination_ingredient_id uuid NOT NULL,
  quantity numeric(14, 3) NOT NULL,
  received_quantity numeric(14, 3),
  source_movement_id uuid,
  destination_movement_id uuid,
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now(),
  CONSTRAINT inventory_stock_transfer_items_transfer_scope_fk
    FOREIGN KEY (transfer_id, source_organization_id, destination_organization_id)
    REFERENCES inventory_stock_transfers(id, source_organization_id, destination_organization_id)
    ON DELETE CASCADE,
  CONSTRAINT inventory_stock_transfer_items_source_ingredient_fk
    FOREIGN KEY (source_ingredient_id, source_organization_id)
    REFERENCES inventory_ingredients(id, organization_id)
    ON DELETE RESTRICT,
  CONSTRAINT inventory_stock_transfer_items_destination_ingredient_fk
    FOREIGN KEY (destination_ingredient_id, destination_organization_id)
    REFERENCES inventory_ingredients(id, organization_id)
    ON DELETE RESTRICT,
  CONSTRAINT inventory_stock_transfer_items_source_movement_fk
    FOREIGN KEY (source_movement_id, source_organization_id)
    REFERENCES inventory_ingredient_movements(id, organization_id)
    ON DELETE RESTRICT,
  CONSTRAINT inventory_stock_transfer_items_destination_movement_fk
    FOREIGN KEY (destination_movement_id, destination_organization_id)
    REFERENCES inventory_ingredient_movements(id, organization_id)
    ON DELETE RESTRICT,
  CONSTRAINT inventory_stock_transfer_items_transfer_source_unique UNIQUE (transfer_id, source_ingredient_id),
  CONSTRAINT inventory_stock_transfer_items_quantity_check CHECK (
    quantity > 0
    AND (received_quantity IS NULL OR (received_quantity >= 0 AND received_quantity <= quantity))
  )
);

CREATE INDEX inventory_stock_transfer_items_transfer_idx
  ON inventory_stock_transfer_items(transfer_id);
