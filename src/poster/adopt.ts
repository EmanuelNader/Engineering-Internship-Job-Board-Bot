import type { Client } from "discord.js";
import { prisma } from "@/db/client";

function guildIdOf(channel: unknown): string | null {
  if (!channel || typeof channel !== "object" || !("guildId" in channel)) return null;
  const guildId = (channel as { guildId?: unknown }).guildId;
  return typeof guildId === "string" && guildId.length > 0 ? guildId : null;
}

/**
 * Attach channel rows saved before servers were tracked, and record the
 * Discord messages those channels already received so they are not sent again.
 */
export async function adoptLegacyGuildData(client: Client): Promise<void> {
  const unscoped = await prisma.channelMap.findMany({ where: { guildId: "" } });
  for (const map of unscoped) {
    try {
      const channel = await client.channels.fetch(map.channelId);
      const guildId = guildIdOf(channel);
      if (!guildId) continue;
      await prisma.channelMap.update({ where: { id: map.id }, data: { guildId } });
    } catch (err) {
      console.error(`Failed to attach channel ${map.channelId} to a server:`, err);
    }
  }

  const maps = await prisma.channelMap.findMany({
    where: { guildId: { not: "" } },
    select: { guildId: true, channelId: true },
  });
  const guildByChannel = new Map(maps.map((map) => [map.channelId, map.guildId]));

  const posted = await prisma.posting.findMany({
    where: { channelIds: { not: null } },
    select: { dedupHash: true, channelIds: true },
  });
  const existing = await prisma.postingDelivery.findMany({
    select: { dedupHash: true, guildId: true, channelId: true },
  });
  const seen = new Set(existing.map((row) => `${row.dedupHash}\n${row.guildId}\n${row.channelId}`));
  const create: { dedupHash: string; guildId: string; channelId: string }[] = [];

  for (const row of posted) {
    let channelIds: string[] = [];
    try {
      const parsed = row.channelIds ? (JSON.parse(row.channelIds) as unknown) : [];
      channelIds = Array.isArray(parsed) ? parsed.map(String) : [];
    } catch {
      channelIds = [];
    }
    for (const channelId of channelIds) {
      const guildId = guildByChannel.get(channelId);
      if (!guildId) continue;
      const key = `${row.dedupHash}\n${guildId}\n${channelId}`;
      if (seen.has(key)) continue;
      seen.add(key);
      create.push({ dedupHash: row.dedupHash, guildId, channelId });
    }
  }

  for (let i = 0; i < create.length; i += 200) {
    await prisma.postingDelivery.createMany({ data: create.slice(i, i + 200) });
  }

  await prisma.postingClaim.deleteMany({ where: { guildId: "" } });
}
