import type { SourceAdapter, RawPosting } from "@/lib/types";
import { adapterConfigs } from "@/config/adapters.config";
import { fetchJson, collectFromTargets } from "./base";

interface GreenhouseJob {
  id: string;
  title: string;
  location?: { name: string } | null;
  absolute_url: string;
  company_name: string;
  first_published?: string;
}

interface GreenhouseResponse {
  jobs: GreenhouseJob[];
  meta: { total: number };
}

export function createGreenhouseAdapter(): SourceAdapter {
  const config = adapterConfigs.find((c) => c.name === "greenhouse");
  if (!config) throw new Error("Greenhouse config not found");
  const liveJobIdsByBoard = new Map<string, Set<string>>();

  return {
    name: "greenhouse",
    pollIntervalSec: config.pollIntervalSec,
    liveJobIdsByBoard,
    async fetchNewPostings(): Promise<RawPosting[]> {
      liveJobIdsByBoard.clear();
      return collectFromTargets(
        "greenhouse",
        config.companies,
        async (company) => {
          const data = await fetchJson<GreenhouseResponse>(
            `https://boards-api.greenhouse.io/v1/boards/${company}/jobs?content=Job`
          );
          liveJobIdsByBoard.set(company, new Set(data.jobs.map((job) => String(job.id))));
          return data.jobs.map((job) => ({
            title: job.title,
            company: job.company_name,
            location: job.location?.name ?? null,
            url: job.absolute_url,
            externalId: job.id.toString(),
            publishedAt: job.first_published,
            raw: job as unknown as Record<string, unknown>,
          }));
        },
        (company) => company
      );
    },
  };
}
