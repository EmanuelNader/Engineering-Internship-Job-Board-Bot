import { prisma } from "@/db/client";
import { titleCompanyHash } from "@/lib/normalize";

type PostingDb = typeof prisma;

function isUniqueConflict(err: unknown): boolean {
  return typeof err === "object" && err !== null && "code" in err && (err as { code?: string }).code === "P2002";
}

/**
 * Reserve this internship before Discord send. A second caller with the same
 * company and cleaned title, or the same row, gets skip and does not post.
 */
export async function claimDiscordSend(
  db: PostingDb,
  dedupHash: string,
  title: string,
  company: string
): Promise<boolean> {
  const titleKey = titleCompanyHash(title, company);
  try {
    return await db.$transaction(async (tx) => {
      const claimed = await tx.postingClaim.findUnique({ where: { titleKey } });
      if (claimed) {
        await tx.posting.updateMany({
          where: { dedupHash, postedAt: null },
          data: { postedAt: new Date(), titleKey },
        });
        return false;
      }

      const row = await tx.posting.findUnique({ where: { dedupHash } });
      if (row?.postedAt) return false;

      await tx.postingClaim.create({ data: { titleKey, dedupHash } });
      if (row) {
        await tx.posting.update({
          where: { dedupHash },
          data: { postedAt: new Date(), titleKey },
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
  dedupHash: string,
  title: string,
  company: string
): Promise<void> {
  const titleKey = titleCompanyHash(title, company);
  await db.postingClaim.delete({ where: { titleKey } }).catch(() => undefined);
  await db.posting.updateMany({
    where: { dedupHash },
    data: { postedAt: null },
  });
}

/** Fill title keys and claims for rows already stored, so a later copy cannot post. */
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

  const posted = await db.posting.findMany({
    where: { postedAt: { not: null } },
    select: { dedupHash: true, title: true, company: true, titleKey: true },
  });
  const claims = new Map<string, { titleKey: string; dedupHash: string }>();
  for (const row of posted) {
    const titleKey = row.titleKey ?? titleCompanyHash(row.title, row.company);
    if (!claims.has(titleKey)) claims.set(titleKey, { titleKey, dedupHash: row.dedupHash });
  }
  if (claims.size === 0) return;

  const already = new Set<string>();
  const keys = [...claims.keys()];
  for (let i = 0; i < keys.length; i += 500) {
    const existing = await db.postingClaim.findMany({
      where: { titleKey: { in: keys.slice(i, i + 500) } },
      select: { titleKey: true },
    });
    for (const row of existing) already.add(row.titleKey);
  }

  const unclaimed = [...claims.values()].filter((claim) => !already.has(claim.titleKey));
  if (unclaimed.length > 0) {
    await db.postingClaim.createMany({ data: unclaimed });
  }
}
