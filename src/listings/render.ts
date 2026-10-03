import { getEnabledRoleFamilies, roleFamilies } from "@/config/roles.config";
import type { RoleFamily } from "@/lib/types";
import { startOfUtcDay } from "@/lib/freshness";

export const LISTINGS_JSON_PATH = "data/listings.json";
export const LISTINGS_MARKDOWN_PATH = "docs/internships.md";

const KNOWN_FAMILIES = new Set<string>(roleFamilies.map((family) => family.family));

export interface DeliveredPosting {
  dedupHash: string;
  title: string;
  company: string;
  location: string | null;
  url: string;
  level: string;
  sourceName: string;
  roleFamily: string;
  publishedAt: Date | null;
  postedAt: Date | null;
  firstSeenAt: Date;
}

export interface InternshipListing {
  id: string;
  company_name: string;
  title: string;
  location: string | null;
  url: string;
  date_posted: string;
  level: string;
  source: string;
  role_families: RoleFamily[];
}

export function formatAge(date: Date, now = new Date()): string {
  const diff = Math.floor((startOfUtcDay(now).getTime() - startOfUtcDay(date).getTime()) / 86400000);
  const days = diff < 0 ? 0 : diff;
  if (days < 7) return `${days}d`;
  if (days < 30) return `${Math.floor(days / 7)}w`;
  return `${Math.floor(days / 30)}mo`;
}

function listingDate(row: DeliveredPosting): Date {
  if (row.publishedAt && !Number.isNaN(row.publishedAt.getTime())) return row.publishedAt;
  if (row.postedAt && !Number.isNaN(row.postedAt.getTime())) return row.postedAt;
  return row.firstSeenAt;
}

function parseFamilies(raw: string): RoleFamily[] {
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    const families: RoleFamily[] = [];
    for (const item of parsed) {
      if (typeof item === "string" && KNOWN_FAMILIES.has(item) && !families.includes(item as RoleFamily)) {
        families.push(item as RoleFamily);
      }
    }
    return families;
  } catch {
    return [];
  }
}

function byNewest(a: InternshipListing, b: InternshipListing): number {
  const delta = Date.parse(b.date_posted) - Date.parse(a.date_posted);
  if (delta !== 0) return delta;
  if (a.id < b.id) return -1;
  if (a.id > b.id) return 1;
  return 0;
}

export function toListings(rows: DeliveredPosting[]): InternshipListing[] {
  return rows
    .map((row) => ({
      id: row.dedupHash,
      company_name: row.company.trim().replace(/\s+/g, " "),
      title: row.title.trim().replace(/\s+/g, " "),
      location: row.location?.trim() ? row.location.trim().replace(/\s+/g, " ") : null,
      url: row.url.trim(),
      date_posted: listingDate(row).toISOString(),
      level: row.level,
      source: row.sourceName,
      role_families: parseFamilies(row.roleFamily),
    }))
    .sort(byNewest);
}

function cell(value: string): string {
  return value.replace(/\|/g, "\\|").replace(/\r?\n/g, " ").trim();
}

function applyLink(url: string): string {
  const safe = url.replace(/ /g, "%20").replace(/\(/g, "%28").replace(/\)/g, "%29").replace(/\|/g, "%7C");
  return `[Apply](${safe})`;
}

function renderMarkdown(listings: InternshipListing[], now: Date): string {
  const parts = [
    "# Engineering internships",
    [
      "Generated from roles the bot posted to Discord. Do not edit by hand.",
      "",
      "Scraped from the [SimplifyJobs](https://github.com/SimplifyJobs/Summer2027-Internships), [SimplifyJobs off-season](https://github.com/SimplifyJobs/Summer2027-Internships/blob/main/README-Off-Season.md), [vanshb03](https://github.com/vanshb03/Summer2027-Internships), and [speedyapply](https://github.com/speedyapply/2027-SWE-College-Jobs) lists, plus the [Greenhouse, Ashby, Lever, Workday, and iCIMS boards](../README.md#what-it-scrapes).",
    ].join("\n"),
  ];

  let sections = 0;
  for (const family of getEnabledRoleFamilies()) {
    const rows = listings.filter((listing) => listing.role_families.includes(family.family));
    if (rows.length === 0) continue;
    sections++;
    const table = [
      `## ${family.roleName}`,
      "",
      "| Company | Role | Location | Application | Age |",
      "| --- | --- | --- | --- | :---: |",
      ...rows.map((listing) => {
        const posted = new Date(listing.date_posted);
        const location = listing.location ? cell(listing.location) : "—";
        return `| **${cell(listing.company_name)}** | ${cell(listing.title)} | ${location} | ${applyLink(listing.url)} | ${formatAge(posted, now)} |`;
      }),
    ];
    parts.push(table.join("\n"));
  }

  if (sections === 0) parts.push("No listings yet.");
  return `${parts.join("\n\n")}\n`;
}

export function renderInternshipFiles(
  rows: DeliveredPosting[],
  now = new Date()
): { json: string; markdown: string } {
  const listings = toListings(rows);
  return {
    json: `${JSON.stringify(listings, null, 2)}\n`,
    markdown: renderMarkdown(listings, now),
  };
}
