-- AlterTable
ALTER TABLE "Comment" ADD COLUMN "authorIdentityId" TEXT;

-- CreateTable
CREATE TABLE "CommentReply" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "commentId" TEXT NOT NULL,
    "authorName" TEXT NOT NULL,
    "authorIdentityId" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "CommentReply_commentId_fkey" FOREIGN KEY ("commentId") REFERENCES "Comment" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "Comment_authorIdentityId_idx" ON "Comment"("authorIdentityId");

-- CreateIndex
CREATE INDEX "CommentReply_commentId_createdAt_idx" ON "CommentReply"("commentId", "createdAt");

-- CreateIndex
CREATE INDEX "CommentReply_authorIdentityId_idx" ON "CommentReply"("authorIdentityId");
