-- Phase 3–6: game phase, canvas positions, intent version reason

CREATE TYPE "GamePhase" AS ENUM ('EARLY', 'MID', 'LATE', 'ENDGAME');

ALTER TABLE "ProjectIntentVersion" ADD COLUMN "reason" TEXT;

ALTER TABLE "Node" ADD COLUMN "gamePhase" "GamePhase";
ALTER TABLE "Node" ADD COLUMN "posX" DOUBLE PRECISION;
ALTER TABLE "Node" ADD COLUMN "posY" DOUBLE PRECISION;

CREATE INDEX "Node_gamePhase_idx" ON "Node"("gamePhase");
