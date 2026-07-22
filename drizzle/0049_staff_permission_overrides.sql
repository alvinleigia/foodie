ALTER TABLE "memberships"
ADD COLUMN "permission_overrides" jsonb DEFAULT '{}'::jsonb NOT NULL;

ALTER TABLE "memberships"
ADD CONSTRAINT "memberships_permission_overrides_object_check"
CHECK (jsonb_typeof("permission_overrides") = 'object');
