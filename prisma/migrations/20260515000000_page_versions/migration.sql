-- AlterTable
ALTER TABLE "Page" ADD COLUMN "currentVersion" INTEGER NOT NULL DEFAULT 1;

-- AlterTable
ALTER TABLE "Comment" ADD COLUMN "pageVersion" INTEGER NOT NULL DEFAULT 1;

-- CreateIndex
CREATE INDEX "Comment_pageId_pageVersion_createdAt_idx" ON "Comment"("pageId", "pageVersion", "createdAt");
