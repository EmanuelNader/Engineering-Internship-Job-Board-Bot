import type { Client } from "discord.js";
import { prisma } from "@/db/client";
import { Poster } from "@/poster/index";
import { ensureLiveSince } from "@/lib/live-since";
import { detectRoleFamily, detectRoleTitles, isUsLocation } from "@/lib/normalize";
import { filterEnabledRoleFamilies } from "@/config/roles.config";
import { parseWorkdayPostedOn } from "@/lib/workday-posted";
import type { RoleFamily } from "@/lib/types";
import { scheduleListingsSync } from "@/listings/sync";

const DEFAULT_SEED_LIMIT = 250;
const DEAD_FAMILIES = new Set(["engineering", "design", "growth"]);
const CLUB_SEED_FAMILIES = new Set<RoleFamily>(["civil-structural", "chemical", "aerospace"]);

function parseJsonArray(value: string): string[] {
  try {
    const parsed = JSON.parse(value) as unknown;
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch {
    return [];
  }
}

function listingFamilies(title: string, stored: string[]): RoleFamily[] {
  const enabled = filterEnabledRoleFamilies(stored);
  const detected = enabled.length > 0 ? enabled : detectRoleFamily(title);
  return detected.filter((family) => CLUB_SEED_FAMILIES.has(family));
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
 * Send civil / chemical / aerospace internships, oldest first.
 * Remaps leftover engineering tags. Skips non-US rows and rows already
 * delivered to a mapped channel.
 */
export async function seedRecentPostings(
  send: Poster["send"],
  _liveSince: Date,
  limit = DEFAULT_SEED_LIMIT
): Promise<{ sent: number; skipped: number }> {
  const mapped = await prisma.channelMap.findMany({ where: { kind: "job" } });
  const mappedIds = new Set(mapped.map((row) => row.channelId));
  if (mappedIds.size === 0) return { sent: 0, skipped: 0 };

  const rows = await prisma.posting.findMany({
    where: {
      kind: "job",
      OR: [
        { roleFamily: { contains: "civil-structural" } },
        { roleFamily: { contains: "chemical" } },
        { roleFamily: { contains: "aerospace" } },
        { roleFamily: { contains: "engineering" } },
      ],
    },
  });

  rows.sort((a, b) => listingTime(a) - listingTime(b));

  let sent = 0;
  let skipped = 0;

  for (const row of rows) {
    let already: string[] = [];
    try {
      already = row.channelIds ? (JSON.parse(row.channelIds) as string[]) : [];
    } catch {
      already = [];
    }
    if (already.some((id) => mappedIds.has(id))) {
      skipped++;
      continue;
    }
    if (!isUsLocation(row.location)) {
      skipped++;
      continue;
    }

    const storedFamilies = parseJsonArray(row.roleFamily);
    const roleFamily = listingFamilies(row.title, storedFamilies);
    if (roleFamily.length === 0) {
      skipped++;
      continue;
    }
    if (sent >= limit) break;
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

    await send(
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
    );
    sent++;
  }

  return { sent, skipped };
}

export async function seedRecentPostingsForGuild(client: Client, guildId: string): Promise<void> {
  const liveSince = await ensureLiveSince(guildId, new Date());
  const poster = new Poster(client, prisma);
  try {
    console.log("Seeding undelivered internships into mapped channels, oldest first...");
    const result = await seedRecentPostings(poster.send.bind(poster), liveSince);
    console.log(`Seeded ${result.sent} jobs (${result.skipped} already in mapped channels)`);
  } finally {
    poster.stop();
    scheduleListingsSync();
  }
}
