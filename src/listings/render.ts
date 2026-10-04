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

/** Drop evergreen requisitions whose original post date is older than a recruiting cycle. */
export const MAX_LISTING_AGE_DAYS = 365;

export function listingAgeDays(date: Date, now = new Date()): number {
  const diff = Math.floor((startOfUtcDay(now).getTime() - startOfUtcDay(date).getTime()) / 86400000);
  return diff < 0 ? 0 : diff;
}

export function formatAge(date: Date, now = new Date()): string {
  const days = listingAgeDays(date, now);
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

export function toListings(rows: DeliveredPosting[], now = new Date()): InternshipListing[] {
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
    .filter((listing) => listingAgeDays(new Date(listing.date_posted), now) <= MAX_LISTING_AGE_DAYS)
    .sort(byNewest);
}

function cell(value: string): string {
  return value.replace(/\|/g, "\\|").replace(/\r?\n/g, " ").trim();
}

const CATEGORY_LABELS: Record<RoleFamily, string> = {
  swe: "Software Engineering",
  "pm-program": "Product Management",
  hardware: "Hardware Engineering",
  data: "Data Science",
  ml: "Machine Learning",
  "civil-structural": "Civil and Structural",
  mechanical: "Mechanical Engineering",
  electrical: "Electrical Engineering",
  chemical: "Chemical Engineering",
  aerospace: "Aerospace Engineering",
  other: "Other",
};

function safeUrl(url: string): string {
  return url.replace(/ /g, "%20").replace(/\(/g, "%28").replace(/\)/g, "%29").replace(/\|/g, "%7C");
}

function applyLink(url: string): string {
  return `[Apply](${safeUrl(url)})`;
}

function companyLink(name: string, url: string): string {
  const label = cell(name).replace(/\[/g, "").replace(/\]/g, "");
  return `[${label}](${safeUrl(url)})`;
}

function categoryAnchor(label: string): string {
  return label.toLowerCase().replace(/[^a-z0-9 ]/g, "").trim().replace(/\s+/g, "-");
}

function renderMarkdown(listings: InternshipListing[], now: Date, sourcesHref: string, botHref: string): string {
  const sections = getEnabledRoleFamilies()
    .map((family) => ({
      label: CATEGORY_LABELS[family.family],
      rows: listings.filter((listing) => listing.role_families.includes(family.family)),
    }))
    .filter((section) => section.rows.length > 0);

  const roleWord = listings.length === 1 ? "role" : "roles";
  const index = [
    "## Browse by category",
    "",
    `${listings.length} ${roleWord}.`,
    "",
    ...sections.map(
      (section) => `- [${section.label}](#${categoryAnchor(section.label)}) (${section.rows.length})`
    ),
  ];

  const parts = [
    "# Engineering internships",
    [
      "US intern, co-op, and fellowship roles posted to Discord. This page is generated. Do not edit it by hand.",
      "",
      `[What it scrapes](${sourcesHref}) · [How the bot works](${botHref})`,
    ].join("\n"),
    index.join("\n"),
  ];

  for (const section of sections) {
    const table = [
      `## ${section.label}`,
      "",
      "[Back to top](#browse-by-category)",
      "",
      "| Company | Role | Location | Application | Age |",
      "| --- | --- | --- | --- | :---: |",
      ...section.rows.map((listing) => {
        const posted = new Date(listing.date_posted);
        const location = listing.location ? cell(listing.location) : "—";
        return `| ${companyLink(listing.company_name, listing.url)} | ${cell(listing.title)} | ${location} | ${applyLink(listing.url)} | ${formatAge(posted, now)} |`;
      }),
    ];
    parts.push(table.join("\n"));
  }

  if (sections.length === 0) parts.push("No listings yet.");
  return `${parts.join("\n\n")}\n`;
}

export function renderInternshipFiles(
  rows: DeliveredPosting[],
  now = new Date()
): { json: string; markdown: string; readme: string } {
  const listings = toListings(rows, now);
  return {
    json: `${JSON.stringify(listings, null, 2)}\n`,
    markdown: renderMarkdown(listings, now, "SOURCES.md", "BOT.md"),
    readme: renderMarkdown(listings, now, "docs/SOURCES.md", "docs/BOT.md"),
  };
}
