ALTER TABLE "organizations"
ADD COLUMN "customer_ordering_hours_enabled" boolean DEFAULT false NOT NULL;

CREATE TABLE "restaurant_ordering_periods" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "organization_id" uuid NOT NULL,
  "day_of_week" integer NOT NULL,
  "opens_at_minute" integer NOT NULL,
  "closes_at_minute" integer NOT NULL,
  "is_24_hours" boolean DEFAULT false NOT NULL,
  "sort_order" integer DEFAULT 0 NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "restaurant_ordering_periods_day_check"
    CHECK ("day_of_week" >= 0 AND "day_of_week" <= 6),
  CONSTRAINT "restaurant_ordering_periods_open_check"
    CHECK ("opens_at_minute" >= 0 AND "opens_at_minute" < 1440),
  CONSTRAINT "restaurant_ordering_periods_close_check"
    CHECK ("closes_at_minute" >= 0 AND "closes_at_minute" < 1440),
  CONSTRAINT "restaurant_ordering_periods_sort_check"
    CHECK ("sort_order" >= 0),
  CONSTRAINT "restaurant_ordering_periods_window_check"
    CHECK (
      ("is_24_hours" = true AND "opens_at_minute" = 0 AND "closes_at_minute" = 0)
      OR
      ("is_24_hours" = false AND "opens_at_minute" <> "closes_at_minute")
    )
);

ALTER TABLE "restaurant_ordering_periods"
ADD CONSTRAINT "restaurant_ordering_periods_organization_fk"
FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id")
ON DELETE cascade ON UPDATE no action;

CREATE UNIQUE INDEX "restaurant_ordering_periods_org_day_sort_unique"
ON "restaurant_ordering_periods" (
  "organization_id",
  "day_of_week",
  "sort_order"
);

CREATE INDEX "restaurant_ordering_periods_org_day_idx"
ON "restaurant_ordering_periods" (
  "organization_id",
  "day_of_week"
);
