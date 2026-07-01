-- @apply
CREATE TABLE IF NOT EXISTS "activities" (
  "id"           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "type"         TEXT,
  "body"         TEXT,
  "related_type" TEXT,
  "related_id"   UUID NOT NULL,
  "user_id"      UUID NOT NULL,
  "created_at"   TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updated_at"   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ix_activities_user_id ON "activities" ("user_id");
CREATE INDEX IF NOT EXISTS ix_activities_related_id ON "activities" ("related_id");
CREATE INDEX IF NOT EXISTS ix_activities_related_type_related_id ON "activities" ("related_type", "related_id");

-- @rollback
DROP INDEX IF EXISTS ix_activities_related_type_related_id;
DROP INDEX IF EXISTS ix_activities_related_id;
DROP INDEX IF EXISTS ix_activities_user_id;
DROP TABLE IF EXISTS "activities";