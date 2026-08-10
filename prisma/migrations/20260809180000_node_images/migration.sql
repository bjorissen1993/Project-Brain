-- CreateTable
CREATE TABLE "NodeImage" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "nodeId" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "filename" TEXT,
    "mimeType" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "NodeImage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "NodeImage_projectId_idx" ON "NodeImage"("projectId");

-- CreateIndex
CREATE INDEX "NodeImage_nodeId_idx" ON "NodeImage"("nodeId");

-- AddForeignKey
ALTER TABLE "NodeImage" ADD CONSTRAINT "NodeImage_nodeId_fkey" FOREIGN KEY ("nodeId") REFERENCES "Node"("id") ON DELETE CASCADE ON UPDATE CASCADE;
