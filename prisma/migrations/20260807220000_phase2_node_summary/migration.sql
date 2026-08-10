-- Phase 2: advisory AI summary fields on Node (never authoritative over content/intent)
ALTER TABLE "Node" ADD COLUMN "summary" TEXT;
ALTER TABLE "Node" ADD COLUMN "projectImpact" TEXT;
