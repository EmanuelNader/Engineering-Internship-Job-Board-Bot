import { prisma } from "@/db/client";
import { getAllAdapters } from "@/adapters";
import { detectLevel, detectRoleFamily, detectRoleTitles, dedupHash, contentHash, titleCompanyHash, isUsLocation } from "@/lib/normalize";
import { sameJobAlreadyStored } from "@/lib/same-job";
import { filterEnabledRoleFamilies } from "@/config/roles.config";
import { isFreshForDiscord, sortNewestFirst, startOfUtcDay } from "@/lib/freshness";
import { resolveAtsPublishedAt } from "@/lib/ats-published-at";

export interface BackfillOptions {
  limitPerSource: number;
  enabled: boolean;
  liveSince?: Date;
}

export type BackfillOnNewPosting = (
  posting: {
    title: string;
    company: string;
    location: string | null;
    url: string;
    sourceName: string;
    roleFamily: string[];
    roleTitles: string[];
    level: string;
    postedAt?: Date;
  },
  dedupHash: string
) => Promise<void>;

export async function runBackfill(
  options: BackfillOptions,
  onNewPosting: BackfillOnNewPosting
): Promise<void> {
  if (!options.enabled) return;

  const adapters = getAllAdapters();
  const liveSince = options.liveSince ?? startOfUtcDay(new Date());

  for (const adapter of adapters) {
    try {
      const rawPostings = await adapter.fetchNewPostings();
      const eligible: {
        raw: (typeof rawPostings)[number];
        level: string;
        roleFamilies: string[];
        roleTitles: string[];
        publishedAt: string | null;
      }[] = [];

      for (const raw of rawPostings) {
        const level = detectLevel(raw.title, raw);
        if (!level) continue;
        if (!isUsLocation(raw.location)) continue;
        const roleFamilies = filterEnabledRoleFamilies(detectRoleFamily(raw.title, raw));
        if (roleFamilies.length === 0) continue;
        eligible.push({
          raw,
          level,
          roleFamilies,
          roleTitles: detectRoleTitles(raw.title, roleFamilies, raw),
          publishedAt: raw.publishedAt ?? null,
        });
      }

      const limited = sortNewestFirst(eligible).slice(0, options.limitPerSource);

      for (const { raw, level, roleFamilies, roleTitles } of limited) {
        const hash = dedupHash(adapter.name, raw.externalId ?? "", raw.title, raw.company);
        const cHash = contentHash(raw.title, raw.company, raw.url);
        const titleKey = titleCompanyHash(raw.title, raw.company);

        if (await sameJobAlreadyStored(hash, cHash, titleKey, raw.url)) continue;

        const publishedAt = raw.publishedAt ? new Date(raw.publishedAt) : null;
        const fresh = isFreshForDiscord(publishedAt, liveSince, adapter.name);

        await prisma.posting.upsert({
          where: { dedupHash: hash },
          create: {
            dedupHash: hash,
            contentHash: cHash,
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
          if (!isFreshForDiscord(existing.publishedAt, liveSince, adapter.name)) {
            await prisma.posting.update({
              where: { dedupHash: hash },
              data: { postedAt: new Date() },
            });
            continue;
          }
          const atsPostedAt = await resolveAtsPublishedAt(raw.url);
          await onNewPosting({
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
        }
      }
    } catch (err) {
      console.error(`Backfill failed for ${adapter.name}:`, err);
    }
  }
}
