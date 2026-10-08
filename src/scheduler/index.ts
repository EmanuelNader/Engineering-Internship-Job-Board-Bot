import type { SourceAdapter, RawPosting } from "@/lib/types";
import { prisma } from "@/db/client";
import { detectLevel, detectRoleFamily, detectRoleTitles, dedupHash, contentHash, titleCompanyHash, isUsLocation } from "@/lib/normalize";
import { sameJobAlreadyStored } from "@/lib/same-job";
import { filterEnabledRoleFamilies } from "@/config/roles.config";
import { isFreshForDiscord, sortNewestFirst, startOfUtcDay } from "@/lib/freshness";
import { resolveAtsPublishedAt } from "@/lib/ats-published-at";

export class SourcesManager {
  private intervals: Map<string, NodeJS.Timeout> = new Map();
  private running = false;

  constructor(
    private readonly adapters: SourceAdapter[],
    private readonly onNewPosting: (posting: Omit<RawPosting, "location"> & { location: string | null; roleFamily: string[]; roleTitles: string[]; level: string; sourceName: string; postedAt?: Date }, dedupHash: string) => Promise<void>,
    private readonly onError: (source: string, error: Error) => void,
    private readonly liveSince: Date = startOfUtcDay(new Date()),
    private readonly afterAdapter?: (adapter: SourceAdapter) => Promise<void>
  ) {}

  start(): void {
    if (this.running) return;
    this.running = true;

    for (const adapter of this.adapters) {
      const run = () => this.runAdapter(adapter);
      run();
      const interval = setInterval(run, adapter.pollIntervalSec * 1000);
      this.intervals.set(adapter.name, interval);
    }
  }

  stop(): void {
    for (const interval of this.intervals.values()) clearInterval(interval);
    this.intervals.clear();
    this.running = false;
  }

  async runOnce(sourceName: string): Promise<void> {
    const adapter = this.adapters.find((a) => a.name === sourceName);
    if (!adapter) throw new Error(`Adapter not found: ${sourceName}`);
    await this.runAdapter(adapter);
  }

  private async runAdapter(adapter: SourceAdapter): Promise<void> {
    let ingested = 0;
    let droppedNonIntern = 0;
    let droppedUnclassified = 0;
    let droppedNonUS = 0;
    let droppedDuplicate = 0;
    let lastError: string | null = null;

    try {
      const rawPostings = sortNewestFirst(await adapter.fetchNewPostings());

      for (const raw of rawPostings) {
        const level = detectLevel(raw.title, raw);
        if (!level) {
          droppedNonIntern++;
          continue;
        }

        if (!isUsLocation(raw.location)) {
          droppedNonUS++;
          continue;
        }

        const roleFamilies = filterEnabledRoleFamilies(detectRoleFamily(raw.title, raw));
        if (roleFamilies.length === 0) {
          droppedUnclassified++;
          continue;
        }

        const roleTitles = detectRoleTitles(raw.title, roleFamilies, raw);
        const hash = dedupHash(adapter.name, raw.externalId ?? "", raw.title, raw.company);
        const contentHashValue = contentHash(raw.title, raw.company, raw.url);
        const titleKey = titleCompanyHash(raw.title, raw.company);

        if (await sameJobAlreadyStored(hash, contentHashValue, titleKey, raw.url)) {
          droppedDuplicate++;
          continue;
        }

        const publishedAt = raw.publishedAt ? new Date(raw.publishedAt) : null;
        const fresh = isFreshForDiscord(publishedAt, this.liveSince, adapter.name);

        await prisma.posting.upsert({
          where: { dedupHash: hash },
          create: {
            dedupHash: hash,
            contentHash: contentHashValue,
            externalId: raw.externalId ?? "",
            sourceName: adapter.name,
            kind: "job",
            level,
            title: raw.title.trim().replace(/\s+/g, " "),
            company: raw.company,
            location: raw.location,
            roleFamily: JSON.stringify(roleFamilies),
            roleTitles: JSON.stringify(roleTitles),
            url: raw.url,
            publishedAt,
            raw: raw.raw ? JSON.stringify(raw.raw) : null,
            postedAt: fresh ? null : new Date(),
            titleKey,
          },
          update: {},
        });

        const existing = await prisma.posting.findUnique({ where: { dedupHash: hash } });
        if (existing && !existing.postedAt) {
          if (!isFreshForDiscord(existing.publishedAt, this.liveSince, adapter.name)) {
            await prisma.posting.update({
              where: { dedupHash: hash },
              data: { postedAt: new Date() },
            });
            continue;
          }
          const atsPostedAt = await resolveAtsPublishedAt(raw.url);
          await this.onNewPosting({
            title: raw.title,
            company: raw.company,
            location: raw.location ?? null,
            url: raw.url,
            sourceName: adapter.name,
            roleFamily: roleFamilies,
            roleTitles,
            level,
            postedAt: atsPostedAt ?? existing.publishedAt ?? undefined,
          }, hash);
          ingested++;
        }
      }
    } catch (err) {
      lastError = (err as Error).message;
      this.onError(adapter.name, err as Error);
    } finally {
      await prisma.source.upsert({
        where: { name: adapter.name },
        create: {
          name: adapter.name,
          lastRunAt: new Date(),
          ingestedCount: ingested,
          droppedNonIntern,
          droppedUnclassified,
          droppedNonUS,
          droppedDuplicate,
          lastError,
          pollIntervalSec: adapter.pollIntervalSec,
        },
        update: {
          lastRunAt: new Date(),
          ingestedCount: { increment: ingested },
          droppedNonIntern: { increment: droppedNonIntern },
          droppedUnclassified: { increment: droppedUnclassified },
          droppedNonUS: { increment: droppedNonUS },
          droppedDuplicate: { increment: droppedDuplicate },
          lastError,
        },
      });
      if (!lastError && this.afterAdapter) {
        try {
          await this.afterAdapter(adapter);
        } catch (err) {
          console.error(`[${adapter.name}] cleanup failed:`, (err as Error).message);
        }
      }
    }
  }
}
