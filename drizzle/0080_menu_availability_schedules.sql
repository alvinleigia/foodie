CREATE UNIQUE INDEX menu_categories_id_organization_unique
  ON menu_categories(id, organization_id);

CREATE TABLE menu_availability_schedules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name text NOT NULL,
  is_enabled boolean NOT NULL DEFAULT true,
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now(),
  CONSTRAINT menu_availability_schedules_id_org_unique UNIQUE (id, organization_id),
  CONSTRAINT menu_availability_schedules_name_check
    CHECK (char_length(btrim(name)) BETWEEN 2 AND 80)
);

CREATE UNIQUE INDEX menu_availability_schedules_org_name_unique
  ON menu_availability_schedules(organization_id, lower(name));
CREATE INDEX menu_availability_schedules_org_enabled_idx
  ON menu_availability_schedules(organization_id, is_enabled, name);

CREATE TABLE menu_availability_periods (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  schedule_id uuid NOT NULL,
  day_of_week integer NOT NULL,
  opens_at_minute integer NOT NULL,
  closes_at_minute integer NOT NULL,
  is_24_hours boolean NOT NULL DEFAULT false,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamp NOT NULL DEFAULT now(),
  CONSTRAINT menu_availability_periods_schedule_org_fk
    FOREIGN KEY (schedule_id, organization_id)
    REFERENCES menu_availability_schedules(id, organization_id)
    ON DELETE CASCADE,
  CONSTRAINT menu_availability_periods_schedule_day_sort_unique
    UNIQUE (schedule_id, day_of_week, sort_order),
  CONSTRAINT menu_availability_periods_values_check CHECK (
    day_of_week BETWEEN 0 AND 6
    AND opens_at_minute BETWEEN 0 AND 1439
    AND closes_at_minute BETWEEN 0 AND 1439
    AND sort_order >= 0
    AND (is_24_hours OR opens_at_minute <> closes_at_minute)
  )
);

CREATE INDEX menu_availability_periods_org_schedule_idx
  ON menu_availability_periods(organization_id, schedule_id);

CREATE TABLE menu_category_availability_schedules (
  organization_id uuid NOT NULL,
  category_id uuid NOT NULL,
  schedule_id uuid NOT NULL,
  created_at timestamp NOT NULL DEFAULT now(),
  CONSTRAINT menu_category_schedules_category_org_fk
    FOREIGN KEY (category_id, organization_id)
    REFERENCES menu_categories(id, organization_id)
    ON DELETE CASCADE,
  CONSTRAINT menu_category_schedules_schedule_org_fk
    FOREIGN KEY (schedule_id, organization_id)
    REFERENCES menu_availability_schedules(id, organization_id)
    ON DELETE CASCADE,
  CONSTRAINT menu_category_schedules_category_schedule_unique
    UNIQUE (category_id, schedule_id)
);

CREATE INDEX menu_category_schedules_org_schedule_idx
  ON menu_category_availability_schedules(organization_id, schedule_id);

CREATE TABLE menu_item_availability_schedules (
  organization_id uuid NOT NULL,
  menu_item_id uuid NOT NULL,
  schedule_id uuid NOT NULL,
  created_at timestamp NOT NULL DEFAULT now(),
  CONSTRAINT menu_item_schedules_item_org_fk
    FOREIGN KEY (menu_item_id, organization_id)
    REFERENCES menu_items(id, organization_id)
    ON DELETE CASCADE,
  CONSTRAINT menu_item_schedules_schedule_org_fk
    FOREIGN KEY (schedule_id, organization_id)
    REFERENCES menu_availability_schedules(id, organization_id)
    ON DELETE CASCADE,
  CONSTRAINT menu_item_schedules_item_schedule_unique
    UNIQUE (menu_item_id, schedule_id)
);

CREATE INDEX menu_item_schedules_org_schedule_idx
  ON menu_item_availability_schedules(organization_id, schedule_id);
