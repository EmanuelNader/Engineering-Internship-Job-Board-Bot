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
  for (const row of posted) {
    const titleKey = row.titleKey ?? titleCompanyHash(row.title, row.company);
    try {
      await db.postingClaim.create({ data: { titleKey, dedupHash: row.dedupHash } });
    } catch (err) {
      if (!isUniqueConflict(err)) throw err;
    }
  }
}
