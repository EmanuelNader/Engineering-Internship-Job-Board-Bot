import type { RawPosting, SourceAdapter } from "@/lib/types";
import { adapterConfigs } from "@/config/adapters.config";
import { collectFromTargets, fetchHtml } from "./base";

const JOBS_ORIGIN = "https://www.workatastartup.com";
const MAX_PAGES = 200;
const BROWSER_HEADERS: Record<string, string> = {
  Accept: "text/html,application/xhtml+xml",
  "User-Agent": "Mozilla/5.0 (compatible; InternshipJobBoardBot/1.0)",
};

interface WaasJob {
  id: number | string;
  title?: string;
  jobType?: string;
  location?: string | null;
  companyName?: string;
}

interface WaasPage {
  jobs: WaasJob[];
  totalJobsCount: number;
  version: string;
}

function decodeHtml(value: string): string {
  return value
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
}

/** Inertia JSON, or the same payload embedded in the first HTML response. */
export function parseWaasPage(body: string): WaasPage {
  const trimmed = body.trim();
  const embedded = trimmed.startsWith("{") ? null : trimmed.match(/data-page="([^"]+)"/)?.[1];
  if (!trimmed.startsWith("{") && !embedded) {
    throw new Error("Work at a Startup page has no job payload");
  }
  const payload = JSON.parse(embedded ? decodeHtml(embedded) : trimmed) as {
    version?: string;
    props?: { jobs?: unknown; totalJobsCount?: unknown };
  };
  const jobs = payload.props?.jobs;
  if (!Array.isArray(jobs)) throw new Error("Work at a Startup page has no jobs");
  const total = Number(payload.props?.totalJobsCount ?? jobs.length);
  return {
    jobs: jobs as WaasJob[],
    totalJobsCount: Number.isFinite(total) ? total : jobs.length,
    version: String(payload.version ?? ""),
  };
}

function jobsUrl(role: string, page: number): string {
  return `${JOBS_ORIGIN}/jobs?role=${encodeURIComponent(role)}&page=${page}`;
}

function toPosting(job: WaasJob): RawPosting | null {
  if (job.jobType !== "Internship") return null;
  const title = job.title?.trim();
  const company = job.companyName?.trim();
  if (!title || !company || job.id == null || job.id === "") return null;
  return {
    title,
    company,
    location: job.location?.trim() ? job.location.trim() : null,
    url: `${JOBS_ORIGIN}/jobs/${job.id}`,
    externalId: String(job.id),
  };
}

async function fetchRole(role: string): Promise<RawPosting[]> {
  const first = parseWaasPage(await fetchHtml(jobsUrl(role, 1), BROWSER_HEADERS));
  const pageSize = Math.max(first.jobs.length, 1);
  const pages = Math.min(MAX_PAGES, Math.max(1, Math.ceil(first.totalJobsCount / pageSize)));
  const jobs = [...first.jobs];
  for (let page = 2; page <= pages; page++) {
    const next = parseWaasPage(
      await fetchHtml(jobsUrl(role, page), {
        ...BROWSER_HEADERS,
        Accept: "text/html, application/xhtml+xml",
        "X-Inertia": "true",
        "X-Inertia-Version": first.version,
        "X-Requested-With": "XMLHttpRequest",
      })
    );
    if (next.jobs.length === 0) break;
    jobs.push(...next.jobs);
  }
  return jobs.flatMap((job) => {
    const posting = toPosting(job);
    return posting ? [posting] : [];
  });
}

export function createWorkatastartupAdapter(): SourceAdapter {
  const config = adapterConfigs.find((c) => c.name === "workatastartup");
  if (!config) throw new Error("Work at a Startup config not found");
  const roles = config.companies.length > 0 ? config.companies : ["eng", "marketing"];

  return {
    name: "workatastartup",
    pollIntervalSec: config.pollIntervalSec,
    async fetchNewPostings(): Promise<RawPosting[]> {
      const postings = await collectFromTargets("workatastartup", roles, fetchRole, (role) => role);
      const seen = new Set<string>();
      return postings.filter((posting) => {
        const id = posting.externalId ?? "";
        if (!id || seen.has(id)) return false;
        seen.add(id);
        return true;
      });
    },
  };
}
