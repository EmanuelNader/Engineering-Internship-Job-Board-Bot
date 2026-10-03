import { prisma } from "@/db/client";
import { commitFiles } from "./github";
import {
  LISTINGS_JSON_PATH,
  LISTINGS_MARKDOWN_PATH,
  renderInternshipFiles,
  type DeliveredPosting,
} from "./render";

const DEFAULT_DEBOUNCE_MS = 20_000;
const COMMIT_MESSAGE = "Update internship listings";

export interface ListingsSyncConfig {
  token?: string;
  repo?: string;
  branch?: string;
  debounceMs?: number;
  now?: () => Date;
  loadDelivered?: () => Promise<DeliveredPosting[]>;
}

export interface ListingsSync {
  schedule(): void;
  flush(): Promise<void>;
  stop(): void;
}

async function loadDeliveredPostings(): Promise<DeliveredPosting[]> {
  const rows = await prisma.posting.findMany({
    where: {
      postedAt: { not: null },
      channelIds: { not: null },
    },
  });
  return rows.map((row) => ({
    dedupHash: row.dedupHash,
    title: row.title,
    company: row.company,
    location: row.location,
    url: row.url,
    level: row.level,
    sourceName: row.sourceName,
    roleFamily: row.roleFamily,
    publishedAt: row.publishedAt,
    postedAt: row.postedAt,
    firstSeenAt: row.firstSeenAt,
  }));
}

export function createListingsSync(config: ListingsSyncConfig): ListingsSync {
  const token = config.token?.trim() || undefined;
  const repo = config.repo?.trim() || undefined;
  const branch = config.branch?.trim() || "main";
  const debounceMs = config.debounceMs ?? DEFAULT_DEBOUNCE_MS;
  const now = config.now ?? (() => new Date());
  const load = config.loadDelivered ?? loadDeliveredPostings;
  const enabled = Boolean(token && repo);

  if (repo && !token) {
    console.warn("LISTINGS_REPO is set but GITHUB_TOKEN is missing; internship list sync is off.");
  }

  let timer: NodeJS.Timeout | null = null;
  let stopped = false;
  let tail: Promise<void> = Promise.resolve();

  async function doFlush(): Promise<void> {
    if (!enabled || !token || !repo) return;
    try {
      const rows = await load();
      if (rows.length === 0) return;
      const rendered = renderInternshipFiles(rows, now());
      const [owner, name] = repo.split("/");
      if (!owner || !name) throw new Error(`Invalid LISTINGS_REPO: ${repo}`);
      const result = await commitFiles({
        token,
        owner,
        repo: name,
        branch,
        message: COMMIT_MESSAGE,
        files: [
          { path: LISTINGS_JSON_PATH, content: rendered.json },
          { path: LISTINGS_MARKDOWN_PATH, content: rendered.markdown },
        ],
      });
      if (result === "committed") {
        console.log(`Updated internship list (${rows.length} roles)`);
      }
    } catch (err) {
      console.error(`Internship list sync failed: ${(err as Error).message}`);
    }
  }

  function flush(): Promise<void> {
    if (!enabled || stopped) return Promise.resolve();
    const run = tail.then(async () => {
      if (stopped) return;
      await doFlush();
    });
    tail = run.then(
      () => undefined,
      () => undefined
    );
    return run;
  }

  return {
    schedule() {
      if (!enabled || stopped) return;
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        timer = null;
        void flush();
      }, debounceMs);
    },
    flush,
    stop() {
      stopped = true;
      if (timer) clearTimeout(timer);
      timer = null;
    },
  };
}

let installed: ListingsSync | null = null;

export function installListingsSync(sync: ListingsSync): void {
  installed = sync;
}

/** Schedule a sync when some other path posted roles outside the main send callback. */
export function scheduleListingsSync(): void {
  installed?.schedule();
}
