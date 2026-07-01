-- @apply
-- No structural changes detected between current and new schema for "activities".
-- This migration is intentionally a no-op.

DO $$ BEGIN
  -- Verify table exists
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_name = 'activities'
  ) THEN
    RAISE EXCEPTION 'Table "activities" does not exist; cannot apply migration 0014_alter_activities.';
  END IF;
END $$;

-- @rollback
-- No changes were applied; rollback is a no-op.

DO $$ BEGIN
  -- Nothing to reverse.
  NULL;
END $$;