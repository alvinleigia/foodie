UPDATE "memberships"
SET
  "role" = 'COMPANY_OWNER'::"membership_role",
  "updated_at" = now()
WHERE "role" = 'COMPANY_MANAGER'::"membership_role";
