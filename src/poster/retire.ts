import type { Client, TextChannel } from "discord.js";
import { prisma } from "@/db/client";
import { canonicalizeCompanyForHash, greenhouseJobId } from "@/lib/normalize";

export interface GreenhousePostingRow {
  dedupHash: string;
  title: string;
  company: string;
  url: string;
  sourceName: string;
  firstSeenAt: Date;
  channelIds: string | null;
}

export function greenhouseBoardFor(company: string, url: string, boards: Iterable<string>): string | null {
  const boardList = [...boards];
  const fromUrl = url.match(/greenhouse\.io\/([^/?#]+)\/jobs\/\d+/i);
  if (fromUrl) {
    const slug = fromUrl[1].toLowerCase();
    const match = boardList.find((board) => board.toLowerCase() === slug);
    if (match) return match;
  }
  const companyKey = canonicalizeCompanyForHash(company);
  return (
    boardList.find(
      (board) => board.toLowerCase() === companyKey || canonicalizeCompanyForHash(board) === companyKey
    ) ?? null
  );
}

export function chooseGreenhouseKeeper<T extends { sourceName: string; title: string; firstSeenAt: Date }>(
  rows: T[]
): T {
  return [...rows].sort((a, b) => {
    const source = Number(a.sourceName !== "greenhouse") - Number(b.sourceName !== "greenhouse");
    if (source !== 0) return source;
    if (a.title.length !== b.title.length) return b.title.length - a.title.length;
    return a.firstSeenAt.getTime() - b.firstSeenAt.getTime();
  })[0];
}

/** Closed Greenhouse reqs, plus extra copies of a req that is still open. */
export function greenhousePostingsToDrop(
  postings: GreenhousePostingRow[],
  liveBoards: ReadonlyMap<string, ReadonlySet<string>>
): GreenhousePostingRow[] {
  const drop: GreenhousePostingRow[] = [];
  const openById = new Map<string, GreenhousePostingRow[]>();
  for (const posting of postings) {
    const id = greenhouseJobId(posting.url);
    if (!id) continue;
    const board = greenhouseBoardFor(posting.company, posting.url, liveBoards.keys());
    const live = board ? liveBoards.get(board) : undefined;
    if (live && live.size > 0 && !live.has(id)) {
      drop.push(posting);
      continue;
    }
    const group = openById.get(id) ?? [];
    group.push(posting);
    openById.set(id, group);
  }
  for (const group of openById.values()) {
    if (group.length < 2) continue;
    const keep = chooseGreenhouseKeeper(group);
    for (const row of group) {
      if (row.dedupHash !== keep.dedupHash) drop.push(row);
    }
  }
  return drop;
}

function storedChannelIds(posting: GreenhousePostingRow): string[] {
  try {
    const value = posting.channelIds ? (JSON.parse(posting.channelIds) as unknown) : [];
    return Array.isArray(value) ? value.map(String) : [];
  } catch {
    return [];
  }
}

function embedMatches(
  embed: { title?: string | null; url?: string | null },
  posting: GreenhousePostingRow
): boolean {
  if (embed.url && embed.url === posting.url) return true;
  const id = greenhouseJobId(posting.url);
  return Boolean(embed.title && embed.title === posting.title && id && greenhouseJobId(embed.url) === id);
}

async function deleteMatchesInChannel(
  client: Client,
  channel: TextChannel,
  postings: GreenhousePostingRow[]
): Promise<number> {
  let deleted = 0;
  let before: string | undefined;
  for (let page = 0; page < 20; page++) {
    const batch = await channel.messages.fetch({ limit: 100, before });
    if (batch.size === 0) break;
    for (const message of batch.values()) {
      if (client.user && message.author.id !== client.user.id) continue;
      const embed = message.embeds[0];
      if (!embed) continue;
      if (!postings.some((posting) => embedMatches(embed, posting))) continue;
      await message.delete();
      deleted++;
      await new Promise((resolve) => setTimeout(resolve, 350));
    }
    const oldest = batch.last();
    before = oldest?.id;
    if (batch.size < 100 || !before) break;
  }
  return deleted;
}

async function deletePostingMessages(
  client: Client,
  channelIds: string[],
  postings: GreenhousePostingRow[]
): Promise<void> {
  for (const channelId of channelIds) {
    try {
      const fetched = await client.channels.fetch(channelId);
      if (!fetched?.isTextBased() || !("messages" in fetched)) continue;
      const removed = await deleteMatchesInChannel(client, fetched as TextChannel, postings);
      if (removed > 0) console.log(`Deleted ${removed} closed or duplicate job message(s) in ${channelId}`);
    } catch (err) {
      console.error(`Could not scan channel ${channelId}:`, (err as Error).message);
    }
  }
}

/** Drop Greenhouse jobs that left the board, and extra copies of one requisition. */
export async function retireGreenhousePostings(
  client: Client,
  liveBoards: ReadonlyMap<string, ReadonlySet<string>> | undefined
): Promise<number> {
  if (!liveBoards || liveBoards.size === 0) return 0;
  const postings = await prisma.posting.findMany({
    select: {
      dedupHash: true,
      title: true,
      company: true,
      url: true,
      sourceName: true,
      firstSeenAt: true,
      channelIds: true,
    },
  });
  const drop = greenhousePostingsToDrop(postings, liveBoards);
  if (drop.length === 0) return 0;

  const deliveries = await prisma.postingDelivery.findMany({
    where: { dedupHash: { in: drop.map((row) => row.dedupHash) } },
    select: { dedupHash: true, channelId: true },
  });
  const channelsByHash = new Map<string, string[]>();
  for (const delivery of deliveries) {
    const list = channelsByHash.get(delivery.dedupHash) ?? [];
    list.push(delivery.channelId);
    channelsByHash.set(delivery.dedupHash, list);
  }
  const channelIds = [
    ...new Set(drop.flatMap((posting) => [...storedChannelIds(posting), ...(channelsByHash.get(posting.dedupHash) ?? [])])),
  ];
  await deletePostingMessages(client, channelIds, drop);

  const hashes = drop.map((row) => row.dedupHash);
  await prisma.postingDelivery.deleteMany({ where: { dedupHash: { in: hashes } } });
  await prisma.postingClaim.deleteMany({ where: { dedupHash: { in: hashes } } });
  await prisma.posting.deleteMany({ where: { dedupHash: { in: hashes } } });
  console.log(`Removed ${drop.length} closed or duplicate Greenhouse posting${drop.length === 1 ? "" : "s"}`);
  return drop.length;
}
