-- @apply
ALTER TABLE "leads" ADD COLUMN IF NOT EXISTS "hubspot_deal_id" TEXT NOT NULL DEFAULT '';

-- @rollback
ALTER TABLE "leads" DROP COLUMN IF EXISTS "hubspot_deal_id";