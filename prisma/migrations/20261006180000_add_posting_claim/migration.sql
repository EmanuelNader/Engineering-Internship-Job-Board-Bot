-- AlterTable
ALTER TABLE "Posting" ADD COLUMN "titleKey" TEXT;

-- CreateIndex
CREATE INDEX "Posting_titleKey_idx" ON "Posting"("titleKey");

-- CreateTable
CREATE TABLE "PostingClaim" (
    "titleKey" TEXT NOT NULL PRIMARY KEY,
    "dedupHash" TEXT NOT NULL,
    "claimedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
