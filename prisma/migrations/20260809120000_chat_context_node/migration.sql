-- Context-scoped chat threads (Structure Focus Space container)

ALTER TABLE "ChatThread" ADD COLUMN "contextNodeId" TEXT;

CREATE INDEX "ChatThread_projectId_contextNodeId_idx" ON "ChatThread"("projectId", "contextNodeId");

ALTER TABLE "ChatThread" ADD CONSTRAINT "ChatThread_contextNodeId_fkey" FOREIGN KEY ("contextNodeId") REFERENCES "Node"("id") ON DELETE SET NULL ON UPDATE CASCADE;
