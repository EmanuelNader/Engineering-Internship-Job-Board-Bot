import { prisma } from "@/db/client";
import { utcDaysAgo } from "@/lib/freshness";

const DEFAULT_LOOKBACK_DAYS = 7;

/** How far back a brand-new server is filled. Existing servers keep their saved start. */
export const NEW_SERVER_FILL_DAYS = 7;

export async function ensureLiveSince(
  guildId: string,
  now = new Date(),
  lookbackDays = DEFAULT_LOOKBACK_DAYS
): Promise<Date> {
  const existing = await prisma.guildState.findUnique({ where: { guildId } });
  if (existing) return existing.liveSince;

  const liveSince = utcDaysAgo(now, lookbackDays);
  await prisma.guildState.create({
    data: { guildId, liveSince },
  });
  return liveSince;
}
