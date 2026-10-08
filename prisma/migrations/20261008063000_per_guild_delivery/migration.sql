-- ChannelMap becomes per server. Existing rows stay unscoped until boot
-- attaches them to the guild that owns the channel.
ALTER TABLE "ChannelMap" ADD COLUMN "guildId" TEXT NOT NULL DEFAULT '';
DROP INDEX "ChannelMap_kind_roleFamily_key";
CREATE UNIQUE INDEX "ChannelMap_guildId_kind_roleFamily_key" ON "ChannelMap"("guildId", "kind", "roleFamily");

-- A claim blocks a second Discord send in one server, not in every server.
CREATE TABLE "PostingClaim_new" (
    "titleKey" TEXT NOT NULL,
    "guildId" TEXT NOT NULL DEFAULT '',
    "dedupHash" TEXT NOT NULL,
    "claimedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY ("titleKey", "guildId")
);
INSERT INTO "PostingClaim_new" ("titleKey", "guildId", "dedupHash", "claimedAt")
SELECT "titleKey", '', "dedupHash", "claimedAt" FROM "PostingClaim";
DROP TABLE "PostingClaim";
ALTER TABLE "PostingClaim_new" RENAME TO "PostingClaim";

-- One row per job, server, and channel that already received the message.
CREATE TABLE "PostingDelivery" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "dedupHash" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "channelId" TEXT NOT NULL,
    "deliveredAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX "PostingDelivery_dedupHash_guildId_channelId_key" ON "PostingDelivery"("dedupHash", "guildId", "channelId");
CREATE INDEX "PostingDelivery_guildId_idx" ON "PostingDelivery"("guildId");
