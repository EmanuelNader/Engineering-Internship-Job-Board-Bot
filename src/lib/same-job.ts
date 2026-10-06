import { prisma } from "@/db/client";
import { atsUrlNeedle } from "@/lib/normalize";

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

  const needle = atsUrlNeedle(url);
  if (!needle) return false;
  const byUrl = await prisma.posting.findFirst({
    where: { url: { contains: needle }, NOT: { dedupHash } },
  });
  return Boolean(byUrl);
}
