WITH ranked_restaurant_memberships AS (
  SELECT
    membership."id",
    row_number() OVER (
      PARTITION BY membership."user_id", membership."organization_id"
      ORDER BY
        membership."is_active" DESC,
        CASE WHEN membership."location_id" IS NULL THEN 0 ELSE 1 END,
        CASE WHEN membership."role" = 'RESTAURANT_MANAGER' THEN 0 ELSE 1 END,
        membership."created_at",
        membership."id"
    ) AS membership_position
  FROM "memberships" membership
  INNER JOIN "organizations" organization
    ON organization."id" = membership."organization_id"
  WHERE organization."type" = 'RESTAURANT'
    AND membership."role" IN ('RESTAURANT_MANAGER', 'ORDER_OPERATOR')
)
DELETE FROM "memberships" membership
USING ranked_restaurant_memberships ranked
WHERE membership."id" = ranked."id"
  AND ranked."membership_position" > 1;

UPDATE "memberships" membership
SET
  "location_id" = NULL,
  "updated_at" = now()
FROM "organizations" organization
WHERE organization."id" = membership."organization_id"
  AND organization."type" = 'RESTAURANT'
  AND membership."role" IN ('RESTAURANT_MANAGER', 'ORDER_OPERATOR')
  AND membership."location_id" IS NOT NULL;
