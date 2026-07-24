UPDATE "prep_stations"
SET
  "name" = 'Drinks',
  "updated_at" = now()
WHERE
  "slug" = 'bar'
  AND "name" = 'Bar'
  AND "type" = 'BAR';
