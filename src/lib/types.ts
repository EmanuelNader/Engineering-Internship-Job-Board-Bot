export type PostingKind = "job" | "event" | "direct-consideration" | "hackathon" | "ambassador";
export type Level = "internship" | "co-op" | "fellowship";
export type RoleFamily =
  | "swe"
  | "pm-program"
  | "hardware"
  | "data"
  | "ml"
  | "civil-structural"
  | "mechanical"
  | "electrical"
  | "chemical"
  | "aerospace"
  | "other";
export type RoleTitle =
  | "swe-frontend" | "swe-backend" | "swe-fullstack" | "swe-mobile" | "swe-devops" | "swe-embedded"
  | "pm-product" | "pm-program" | "pm-tpm"
  | "hw-silicon" | "hw-pcb" | "hw-fpga" | "hw-asic"
  | "data-scientist" | "data-engineer" | "data-analytics"
  | "ml-engineer" | "ml-researcher" | "ml-ai-eng"
  | "eng-structural" | "eng-civil" | "eng-electrical" | "eng-mechanical" | "eng-chemical" | "eng-aerospace"
  | "design-ux" | "design-ui" | "design-product" | "design-interaction"
  | "growth-general" | "growth-lifecycle" | "growth-acquisition";
export type SourceName =
  | "greenhouse"
  | "ashby"
  | "lever"
  | "workday"
  | "icims"
  | "simplify"
  | "github"
  | "custom";

export interface RawPosting {
  title: string;
  company: string;
  location?: string | null;
  url: string;
  externalId?: string;
  publishedAt?: string;
  raw?: Record<string, unknown>;
}

export interface Posting {
  dedupHash: string;
  externalId: string;
  sourceName: SourceName;
  kind: PostingKind;
  level: Level;
  title: string;
  company: string;
  location: string | null;
  roleFamily: RoleFamily[];
  roleTitles: RoleTitle[];
  url: string;
  firstSeenAt: Date;
  raw?: Record<string, unknown>;
}

export interface SourceAdapter {
  name: SourceName;
  pollIntervalSec: number;
  fetchNewPostings(): Promise<RawPosting[]>;
  /** Job ids still on each Greenhouse board after the latest successful fetch. */
  liveJobIdsByBoard?: ReadonlyMap<string, ReadonlySet<string>>;
}