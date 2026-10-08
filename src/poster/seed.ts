import type { Client } from "discord.js";
import { prisma } from "@/db/client";
import { Poster } from "@/poster/index";
import { ensureLiveSince, NEW_SERVER_FILL_DAYS } from "@/lib/live-since";
import { detectRoleFamily, detectRoleTitles, isUsLocation } from "@/lib/normalize";
import { filterEnabledRoleFamilies } from "@/config/roles.config";
import { isFreshForDiscord } from "@/lib/freshness";
import { parseWorkdayPostedOn } from "@/lib/workday-posted";
import type { RoleFamily } from "@/lib/types";
import { scheduleListingsSync } from "@/listings/sync";

const DEAD_FAMILIES = new Set(["engineering", "design", "growth"]);

export interface SeedOptions {
  guildId: string;
  families: RoleFamily[];
}

function parseJsonArray(value: string): string[] {
  try {
    const parsed = JSON.parse(value) as unknown;
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch {
    return [];
  }
}

function listingFamilies(title: string, stored: string[], allowed: Set<RoleFamily>): RoleFamily[] {
  const detected = filterEnabledRoleFamilies(detectRoleFamily(title));
  const fromStored = filterEnabledRoleFamilies(stored);
  return [...new Set([...detected, ...fromStored])].filter((family) => allowed.has(family));
}

function listingTime(row: {
  publishedAt: Date | null;
  firstSeenAt: Date;
  raw: string | null;
}): number {
  if (row.publishedAt) return row.publishedAt.getTime();
  if (row.raw) {
    try {
      const raw = JSON.parse(row.raw) as { postedOn?: string; postedDate?: string };
      const parsed = parseWorkdayPostedOn(raw.postedOn ?? raw.postedDate);
      if (parsed) return parsed.getTime();
    } catch {
      // ignore malformed raw
    }
  }
  return row.firstSeenAt.getTime();
}

/**
 * Send the chosen families for one server, oldest first.
 * Skips non-US rows, rows outside that server's window, and channels
 * that already received the job.
 */
export async function seedRecentPostings(
  send: (posting: Parameters<Poster["send"]>[0], dedupHash: string) => Promise<void>,
  liveSince: Date,
  options: SeedOptions
): Promise<{ sent: number; skipped: number }> {
  const allowed = new Set(options.families);
  if (allowed.size === 0) return { sent: 0, skipped: 0 };

  const mapped = await prisma.channelMap.findMany({
    where: { kind: "job", guildId: options.guildId, roleFamily: { in: [...allowed] } },
  });
  if (mapped.length === 0) return { sent: 0, skipped: 0 };
  const mappedIds = mapped.map((row) => row.channelId);

  const rows = await prisma.posting.findMany({ where: { kind: "job" } });
  const delivered = await prisma.postingDelivery.findMany({
    where: { guildId: options.guildId, channelId: { in: mappedIds } },
    select: { dedupHash: true, channelId: true },
  });
  const deliveredKey = new Set(delivered.map((row) => `${row.dedupHash}:${row.channelId}`));

  rows.sort((a, b) => listingTime(a) - listingTime(b));

  let sent = 0;
  let skipped = 0;
  const queued: Promise<void>[] = [];

  for (const row of rows) {
    if (!isUsLocation(row.location)) {
      skipped++;
      continue;
    }
    if (!isFreshForDiscord(row.publishedAt, liveSince, row.sourceName)) {
      skipped++;
      continue;
    }

    const storedFamilies = parseJsonArray(row.roleFamily);
    const roleFamily = listingFamilies(row.title, storedFamilies, allowed);
    if (roleFamily.length === 0) {
      skipped++;
      continue;
    }

    const targets = mapped.filter((channel) => roleFamily.includes(channel.roleFamily as RoleFamily));
    const pending = targets.filter((channel) => !deliveredKey.has(`${row.dedupHash}:${channel.channelId}`));
    if (pending.length === 0) {
      skipped++;
      continue;
    }

    const roleTitles = detectRoleTitles(row.title, roleFamily);
    if (storedFamilies.some((family) => DEAD_FAMILIES.has(family))) {
      await prisma.posting.update({
        where: { dedupHash: row.dedupHash },
        data: {
          roleFamily: JSON.stringify(roleFamily),
          roleTitles: JSON.stringify(roleTitles),
        },
      });
    }

    queued.push(
      send(
        {
          title: row.title,
          company: row.company,
          location: row.location,
          url: row.url,
          level: row.level,
          sourceName: row.sourceName,
          roleFamily,
          roleTitles,
          postedAt: row.publishedAt ?? new Date(listingTime(row)),
        },
        row.dedupHash
      )
    );
    sent++;
  }

  await Promise.all(queued);
  return { sent, skipped };
}

export async function seedRecentPostingsForGuild(
  client: Client,
  guildId: string,
  families: RoleFamily[]
): Promise<void> {
  const liveSince = await ensureLiveSince(guildId, new Date(), NEW_SERVER_FILL_DAYS);
  const poster = new Poster(client, prisma);
  try {
    const names = families.join(", ");
    console.log(`Filling ${names || "no channels"} for ${guildId} from oldest to newest...`);
    const result = await seedRecentPostings(
      (posting, hash) => poster.send(posting, hash, guildId),
      liveSince,
      { guildId, families }
    );
    console.log(`Seeded ${result.sent} jobs (${result.skipped} skipped) for ${guildId}`);
  } finally {
    poster.stop();
    scheduleListingsSync();
  }
}
