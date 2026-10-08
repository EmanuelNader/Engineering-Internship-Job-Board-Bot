import { prisma } from "@/db/client";
import { titleCompanyHash } from "@/lib/normalize";

type PostingDb = typeof prisma;

function isUniqueConflict(err: unknown): boolean {
  return typeof err === "object" && err !== null && "code" in err && (err as { code?: string }).code === "P2002";
}

/**
 * Reserve this internship for one server before Discord send.
 * A second job with the same company and cleaned title in that server does not post.
 * Another server can still post it.
 */
export async function claimDiscordSend(
  db: PostingDb,
  dedupHash: string,
  title: string,
  company: string,
  guildId: string
): Promise<boolean> {
  const titleKey = titleCompanyHash(title, company);
  try {
    return await db.$transaction(async (tx) => {
      const claimed = await tx.postingClaim.findUnique({
        where: { titleKey_guildId: { titleKey, guildId } },
      });
      if (claimed && claimed.dedupHash !== dedupHash) {
        await tx.posting.updateMany({
          where: { dedupHash, postedAt: null },
          data: { postedAt: new Date(), titleKey },
        });
        return false;
      }

      if (!claimed) {
        await tx.postingClaim.create({ data: { titleKey, guildId, dedupHash } });
      }

      const row = await tx.posting.findUnique({ where: { dedupHash } });
      if (row && row.titleKey !== titleKey) {
        await tx.posting.update({
          where: { dedupHash },
          data: { titleKey },
        });
      }
      return true;
    });
  } catch (err) {
    if (isUniqueConflict(err)) return false;
    throw err;
  }
}

export async function releaseDiscordClaim(
  db: PostingDb,
  _dedupHash: string,
  title: string,
  company: string,
  guildId: string
): Promise<void> {
  const titleKey = titleCompanyHash(title, company);
  await db.postingClaim
    .delete({ where: { titleKey_guildId: { titleKey, guildId } } })
    .catch(() => undefined);
}

/** Fill title keys and per-server claims for jobs already delivered. */
export async function rememberPostedJobs(db: PostingDb = prisma): Promise<void> {
  const missing = await db.posting.findMany({
    where: { titleKey: null },
    select: { dedupHash: true, title: true, company: true },
  });
  for (const row of missing) {
    await db.posting.update({
      where: { dedupHash: row.dedupHash },
      data: { titleKey: titleCompanyHash(row.title, row.company) },
    });
  }

  const [posted, deliveries] = await Promise.all([
    db.posting.findMany({
      where: { postedAt: { not: null } },
      select: { dedupHash: true, title: true, company: true, titleKey: true },
    }),
    db.postingDelivery.findMany({
      select: { dedupHash: true, guildId: true },
    }),
  ]);
  const byHash = new Map(posted.map((row) => [row.dedupHash, row]));
  const claims = new Map<string, { titleKey: string; guildId: string; dedupHash: string }>();
  for (const delivery of deliveries) {
    if (!delivery.guildId) continue;
    const row = byHash.get(delivery.dedupHash);
    if (!row) continue;
    const titleKey = row.titleKey ?? titleCompanyHash(row.title, row.company);
    const id = `${titleKey}\n${delivery.guildId}`;
    if (!claims.has(id)) claims.set(id, { titleKey, guildId: delivery.guildId, dedupHash: row.dedupHash });
  }
  if (claims.size === 0) return;

  const already = new Set<string>();
  const keys = [...claims.values()];
  for (let i = 0; i < keys.length; i += 200) {
    const slice = keys.slice(i, i + 200);
    const existing = await db.postingClaim.findMany({
      where: {
        OR: slice.map((claim) => ({ titleKey: claim.titleKey, guildId: claim.guildId })),
      },
      select: { titleKey: true, guildId: true },
    });
    for (const row of existing) already.add(`${row.titleKey}\n${row.guildId}`);
  }

  const unclaimed = [...claims.values()].filter(
    (claim) => !already.has(`${claim.titleKey}\n${claim.guildId}`)
  );
  if (unclaimed.length > 0) {
    await db.postingClaim.createMany({ data: unclaimed });
  }
}
