import { prisma } from "@/db/client";
import { atsLookupNeedles, greenhouseJobId } from "@/lib/normalize";

/** True when a different saved row is already this internship. */
export async function sameJobAlreadyStored(
  dedupHash: string,
  contentHashValue: string,
  titleKey: string,
  url: string
): Promise<boolean> {
  const byContent = await prisma.posting.findUnique({ where: { contentHash: contentHashValue } });
  if (byContent && byContent.dedupHash !== dedupHash) return true;

  const byTitle = await prisma.posting.findFirst({
    where: { titleKey, NOT: { dedupHash } },
  });
  if (byTitle) return true;

  const needles = atsLookupNeedles(url);
  if (needles.length === 0) return false;
  const rows = await prisma.posting.findMany({
    where: {
      OR: needles.map((needle) => ({ url: { contains: needle } })),
      NOT: { dedupHash },
    },
    select: { url: true },
  });
  const wanted = greenhouseJobId(url);
  if (!wanted) return rows.length > 0;
  return rows.some((row) => greenhouseJobId(row.url) === wanted);
}
