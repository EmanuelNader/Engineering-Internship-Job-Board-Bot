import type { RawPosting, Level, RoleFamily, RoleTitle, SourceName } from "./types";
import { createHash } from "node:crypto";

const INCLUDE_INTERNSHIP = /\b(intern|internship|summer\s+202\d|fall\s+202\d|spring\s+202\d)\b/i;
const INCLUDE_COOP = /\b(co[- ]?op|cooperative\s+education|placement\s+year)\b/i;
const INCLUDE_FELLOWSHIP = /\b(fellowship|fellow|fellows\s+program)\b/i;
const NAMED_FELLOWSHIPS = /\b(xrds|google\s+phd|fb\s+fellowship|facebook\s+fellowship|microsoft\s+research\s+phd|nvidia\s+graduate\s+fellowship)\b/i;

const DROP_SENIORITY = /\b(senior|staff|principal|manager(?!\s+of\s+\w+\s+intern)|head\s+of|director|vp\b|lead\b)/i;
const DROP_NEWGRAD = /\b(new\s+grad|new\s+graduate|graduate\s+program|early\s+career|development\s+program|rotational\s+program|campus\s+hire|entry\s+level|campus\s+to\s+career)\b/i;

export function detectLevel(title: string | null | undefined, _raw?: RawPosting): Level | null {
  if (typeof title !== "string" || !title.trim()) return null;
  const norm = title.trim().replace(/\s+/g, " ").toLowerCase();

  if (DROP_NEWGRAD.test(norm)) return null;

  const isInternship = INCLUDE_INTERNSHIP.test(norm);
  const isCoop = INCLUDE_COOP.test(norm);
  const isFellowship = INCLUDE_FELLOWSHIP.test(norm) || NAMED_FELLOWSHIPS.test(norm);

  if (!isInternship && !isCoop && !isFellowship) return null;

  if (DROP_SENIORITY.test(norm)) {
    if (!isInternship && !isCoop && !isFellowship) return null;
  }

  if (isFellowship) return "fellowship";
  if (isCoop) return "co-op";
  return "internship";
}

const FAMILY_KEYWORDS: Record<RoleFamily, RegExp[]> = {
  swe: [
    /\b(frontend|front[- ]?end)\b/i,
    /\b(backend|back[- ]?end)\b/i,
    /\b(full[- ]?stack|fullstack)\b/i,
    /\b(mobile|ios|android)\b/i,
    /\b(devops|dev[- ]?ops|sre|site\s+reliability)\b/i,
    /\b(embedded|firmware)\b/i,
    /\b(software\s+engineer|swe\b)\b/i,
  ],
  "pm-program": [
    /\b(product\s+manager|pm\b)\b/i,
    /\b(technical\s+program\s+manager|tpm\b)\b/i,
    /\b(program\s+manager)\b/i,
  ],
  hardware: [
    /\b(silicon|vlsi|chip\s+design)\b/i,
    /\b(pcb|printed\s+circuit\s+board)\b/i,
    /\b(fpga)\b/i,
    /\b(asic|verification|physical\s+design)\b/i,
    /\b(hardware)\b/i,
  ],
  data: [
    /\b(data\s+scientist)\b/i,
    /\b(data\s+engineer)\b/i,
    /\b(analytics|data\s+analyst)\b/i,
  ],
  ml: [
    /\b(machine\s+learning|ml\s+engineer)\b/i,
    /\b(ml\s+researcher|machine\s+learning\s+research)\b/i,
    /\b(ai\s+engineer|artificial\s+intelligence\s+engineer)\b/i,
  ],
  "civil-structural": [
    /\b(structural\s+engineer(?:ing)?)\b/i,
    /\b(civil\s+engineer(?:ing)?)\b/i,
    /\bmaterials\s*(?:and|&)\s*structures?\b/i,
    /\bconstruction\s+manag(?:er|ement)\b/i,
  ],
  mechanical: [
    /\b(mechanical\s+engineer(?:ing)?)\b/i,
    /\bthermal\b/i,
    /\bhvac\b/i,
    /\bmanufacturing\b/i,
    /(?<!software\s)\bdesign\s+engineer(?:ing)?\b/i,
  ],
  electrical: [
    /\b(electrical\s+engineer(?:ing)?)\b/i,
    /\bpower\s+engineer(?:ing)?\b/i,
    /\bcontrols?\s+engineer(?:ing)?\b/i,
    /\bcontrol\s+systems?\b/i,
    /\bcontrols\b/i,
    /\brf\b/i,
    /\bradio\s+frequency\b/i,
  ],
  chemical: [
    /\b(chemical\s+engineer(?:ing)?)\b/i,
    /\bprocess\s+engineer(?:ing)?\b/i,
    /\bprocess\s+development\b/i,
    /\bmanufacturing\s+engineer(?:ing)?\b/i,
    /\bmaterials?\s+engineer(?:ing)?\b/i,
    /\bpolymer\b/i,
    /\bpetroleum\b/i,
    /\brefin(?:ing|ery)\b/i,
  ],
  aerospace: [
    /\b(aerospace\s+engineer(?:ing)?)\b/i,
    /\bpropulsion\b/i,
    /\baerodynamics?\b/i,
    /\baerostructures?\b/i,
    /\bflight\s+tests?\b/i,
    /\bflight\s+sciences?\b/i,
    /\bavionics\b/i,
    /\bgnc\b/i,
  ],
  other: [
    /\b(ux\s+designer|ux\s+design|user\s+experience)\b/i,
    /\b(ui\s+designer|ui\s+design|user\s+interface)\b/i,
    /\bui\s*\/\s*ux\b/i,
    /\bux\s*\/\s*ui\b/i,
    /\bproduct\s+design(?!\s+engineer)/i,
    /\binteraction\s+design/i,
    /\b(ux|user|design)\s+research/i,
    /\b(visual|brand|graphic|content|motion|industrial)\s+design/i,
    /\b(growth\s+marketing|growth\s+engineer|growth\s+intern)\b/i,
    /\b(lifecycle\s+marketing)\b/i,
    /\b(user\s+acquisition|acquisition\s+marketing)\b/i,
    /\bproduct\s+marketing\b/i,
    /\bdemand\s+gen/i,
    /\bperformance\s+marketing\b/i,
  ],
};

export function detectRoleFamily(title: string, _raw?: RawPosting): RoleFamily[] {
  const norm = title.trim().replace(/\s+/g, " ").toLowerCase();
  const families: RoleFamily[] = [];
  for (const [family, patterns] of Object.entries(FAMILY_KEYWORDS)) {
    if (patterns.some((re) => re.test(norm))) {
      families.push(family as RoleFamily);
    }
  }
  return families;
}

const TITLE_KEYWORDS: Record<RoleFamily, Partial<Record<RoleTitle, RegExp>>> = {
  swe: {
    "swe-frontend": /\b(frontend|front[- ]?end)\b/i,
    "swe-backend": /\b(backend|back[- ]?end)\b/i,
    "swe-fullstack": /\b(full[- ]?stack|fullstack)\b/i,
    "swe-mobile": /\b(mobile|ios|android)\b/i,
    "swe-devops": /\b(devops|dev[- ]?ops|sre|site\s+reliability)\b/i,
    "swe-embedded": /\b(embedded|firmware)\b/i,
  },
  "pm-program": {
    "pm-product": /\b(product\s+manager|pm\b)\b/i,
    "pm-tpm": /\b(technical\s+program\s+manager|tpm\b)\b/i,
    "pm-program": /\b(?<!technical\s+)program\s+manager\b/i,
  },
  hardware: {
    "hw-silicon": /\b(silicon|vlsi|chip\s+design)\b/i,
    "hw-pcb": /\b(pcb|printed\s+circuit\s+board)\b/i,
    "hw-fpga": /\b(fpga)\b/i,
    "hw-asic": /\b(asic|verification|physical\s+design)\b/i,
  },
  data: {
    "data-scientist": /\b(data\s+scientist)\b/i,
    "data-engineer": /\b(data\s+engineer)\b/i,
    "data-analytics": /\b(analytics|data\s+analyst)\b/i,
  },
  ml: {
    "ml-engineer": /\b(machine\s+learning|ml\s+engineer)\b/i,
    "ml-researcher": /\b(ml\s+researcher|machine\s+learning\s+research)\b/i,
    "ml-ai-eng": /\b(ai\s+engineer|artificial\s+intelligence\s+engineer)\b/i,
  },
  "civil-structural": {
    "eng-structural": /\b(structural\s+engineer(?:ing)?|materials\s*(?:and|&)\s*structures?)\b/i,
    "eng-civil": /\b(civil\s+engineer(?:ing)?|construction\s+manag(?:er|ement))\b/i,
  },
  mechanical: {
    "eng-mechanical": /\b(mechanical\s+engineer(?:ing)?|thermal|hvac|manufacturing)\b|(?<!software\s)\bdesign\s+engineer(?:ing)?\b/i,
  },
  electrical: {
    "eng-electrical": /\b(electrical\s+engineer(?:ing)?|power\s+engineer(?:ing)?|controls?\s+engineer(?:ing)?|control\s+systems?|controls|rf|radio\s+frequency)\b/i,
  },
  chemical: {
    "eng-chemical": /\b(chemical\s+engineer(?:ing)?|process\s+engineer(?:ing)?|process\s+development|manufacturing\s+engineer(?:ing)?|materials?\s+engineer(?:ing)?|polymer|petroleum|refin(?:ing|ery))\b/i,
  },
  aerospace: {
    "eng-aerospace": /\b(aerospace\s+engineer(?:ing)?|propulsion|aerodynamics?|aerostructures?|flight\s+tests?|flight\s+sciences?|avionics|gnc)\b/i,
  },
  other: {
    "design-ux": /\b(ux\s+designer|ux\s+design|user\s+experience|ux\s+research|user\s+research)\b/i,
    "design-ui": /\b(ui\s+designer|ui\s+design|user\s+interface|ui\s*\/\s*ux|ux\s*\/\s*ui)\b/i,
    "design-product": /\bproduct\s+designer?\b(?!\s+engineer)|\b(visual|brand|graphic|content|motion|industrial)\s+designer?\b/i,
    "design-interaction": /\binteraction\s+design/i,
    "growth-general": /\b(growth\s+marketing|growth\s+engineer|growth\s+intern|product\s+marketing|demand\s+gen|performance\s+marketing)\b/i,
    "growth-lifecycle": /\b(lifecycle\s+marketing)\b/i,
    "growth-acquisition": /\b(user\s+acquisition|acquisition\s+marketing)\b/i,
  },
};

export function detectRoleTitles(
  title: string,
  roleFamilies: RoleFamily[],
  _raw?: RawPosting
): RoleTitle[] {
  const norm = title.trim().replace(/\s+/g, " ").toLowerCase();
  const titles: RoleTitle[] = [];
  for (const family of roleFamilies) {
    const patterns = TITLE_KEYWORDS[family];
    if (!patterns) continue;
    for (const [roleTitle, re] of Object.entries(patterns)) {
      if (re.test(norm)) {
        titles.push(roleTitle as RoleTitle);
      }
    }
  }
  return titles;
}

function normalizeForHash(s: string): string {
  return s.trim().replace(/\s+/g, " ").toLowerCase();
}

const SEASON_YEAR = String.raw`(summer|winter|fall|autumn|spring)\s+20\d{2}`;

function stripEmoji(s: string): string {
  return s.replace(/\p{Extended_Pictographic}/gu, "").replace(/[\uFE0F\u200D]/g, "");
}

export function canonicalizeCompanyForHash(company: string): string {
  let s = stripEmoji(normalizeForHash(company));
  s = s.replace(
    /\b(incorporated|inc|llc|ltd|limited|corp|corporation|co|company|industries|industry|technologies|technology|labs|laboratory|the)\b\.?/g,
    " "
  );
  s = s.replace(/[^a-z0-9\s]/g, " ");
  return s.replace(/\s+/g, " ").trim();
}

/** Strip term/year wrappers so list titles match ATS titles. */
export function canonicalizeTitleForHash(title: string): string {
  let s = stripEmoji(normalizeForHash(title));
  const yearSeason = String.raw`20\d{2}\s+(summer|winter|fall|autumn|spring)`;
  s = s.replace(new RegExp(String.raw`\(\s*${SEASON_YEAR}\s*\)`, "gi"), " ");
  s = s.replace(new RegExp(String.raw`\(\s*${yearSeason}\s*\)`, "gi"), " ");
  s = s.replace(new RegExp(String.raw`^${SEASON_YEAR}\s*[-:–—]?\s*`, "i"), " ");
  s = s.replace(new RegExp(String.raw`^${yearSeason}\s*[-:–—]?\s*`, "i"), " ");
  s = s.replace(new RegExp(String.raw`[,.\-–—]\s*${SEASON_YEAR}\s*$`, "i"), " ");
  s = s.replace(new RegExp(String.raw`\s+${SEASON_YEAR}\s*$`, "i"), " ");
  s = s.replace(new RegExp(String.raw`\s+${SEASON_YEAR}\s+`, "gi"), " ");
  s = s.replace(/\bswe\b/g, "software engineer");
  s = s.replace(/\bsoftware engineering intern(?:ship)?\b/g, "software engineer intern");
  s = s.replace(/\binternship\b/g, "intern");
  s = s.replace(/\bfront[\s-]?end\b/g, "frontend");
  s = s.replace(/\bback[\s-]?end\b/g, "backend");
  s = s.replace(/\bfull[\s-]?stack\b/g, "fullstack");
  s = s.replace(/\bco[\s-]?op\b/g, "coop");
  return s.replace(/\s+/g, " ").trim();
}

export function canonicalAtsJobKey(url: string | null | undefined): string | null {
  if (!url) return null;
  const greenhouse = url.match(/greenhouse\.io\/([^/?#]+)\/jobs\/(\d+)/i);
  if (greenhouse) return `greenhouse:${greenhouse[1].toLowerCase()}:${greenhouse[2]}`;
  const lever = url.match(/lever\.co\/([^/?#]+)\/([0-9a-f-]{8,})/i);
  if (lever) return `lever:${lever[1].toLowerCase()}:${lever[2].toLowerCase()}`;
  const ashby = url.match(/ashbyhq\.com\/([^/?#]+)\/([0-9a-f-]{8,})/i);
  if (ashby) return `ashby:${ashby[1].toLowerCase()}:${ashby[2].toLowerCase()}`;
  const workday = url.match(/myworkdayjobs\.com\/[^?#]*?(?:_|\/)((?:JR|R)[-_]?\d{3,})/i);
  if (workday) return `workday:${workday[1].toLowerCase().replace(/_/g, "")}`;
  const simplify = url.match(/simplify\.jobs\/p\/([0-9a-f-]{8,})/i);
  if (simplify) return `simplify:${simplify[1].toLowerCase()}`;
  return null;
}

/** SQLite substring to find the same ATS job stored under an older contentHash. */
export function atsUrlNeedle(url: string | null | undefined): string | null {
  if (!url) return null;
  const greenhouse = url.match(/greenhouse\.io\/([^/?#]+)\/jobs\/(\d+)/i);
  if (greenhouse) return `/${greenhouse[1]}/jobs/${greenhouse[2]}`;
  const lever = url.match(/lever\.co\/([^/?#]+)\/([0-9a-f-]{8,})/i);
  if (lever) return `/${lever[1]}/${lever[2]}`;
  const ashby = url.match(/ashbyhq\.com\/([^/?#]+)\/([0-9a-f-]{8,})/i);
  if (ashby) return `/${ashby[1]}/${ashby[2]}`;
  const workday = url.match(/myworkdayjobs\.com\/[^?#]*?(?:_|\/)((?:JR|R)[-_]?\d{3,})/i);
  if (workday) return workday[1];
  const simplify = url.match(/simplify\.jobs\/p\/([0-9a-f-]{8,})/i);
  if (simplify) return `/p/${simplify[1]}`;
  return null;
}

const US_STATES = /\b(AL|AK|AZ|AR|CA|CO|CT|DE|FL|GA|HI|ID|IL|IN|IA|KS|KY|LA|ME|MD|MA|MI|MN|MS|MO|MT|NE|NV|NH|NJ|NM|NY|NC|ND|OH|OK|OR|PA|RI|SC|SD|TN|TX|UT|VT|VA|WA|WV|WI|WY|DC)\b/;
const US_STATE_NAMES =
  /\b(alabama|alaska|arizona|arkansas|california|colorado|connecticut|delaware|florida|georgia|hawaii|idaho|illinois|indiana|iowa|kansas|kentucky|louisiana|maine|maryland|massachusetts|michigan|minnesota|mississippi|missouri|montana|nebraska|nevada|new hampshire|new jersey|new mexico|new york|north carolina|north dakota|ohio|oklahoma|oregon|pennsylvania|rhode island|south carolina|south dakota|tennessee|texas|utah|vermont|virginia|washington|west virginia|wisconsin|wyoming|district of columbia)\b/i;
const US_INDICATORS = /\b(united\s+states|usa|u\.?s\.?a?)\b/i;
const US_CITIES =
  /\b(san francisco|sf|nyc|sfnyc|new york city|los angeles|seattle|boston|chicago|denver|atlanta|miami|dallas|houston|phoenix|portland|san diego|san jose|palo alto|mountain view|sunnyvale|menlo park|cupertino|redmond|bellevue|irvine|santa clara|boulder|pittsburgh|philadelphia|detroit|minneapolis|raleigh|durham|charlotte|nashville|salt lake|ann arbor|cambridge|brooklyn|manhattan|hoboken|jersey city|arlington|bethesda|reston|findlay|san mateo|berkeley|oakland|sacramento|santa monica|pasadena)\b/i;
const CANADA_WORKDAY = /\bCA-(NS|ON|BC|QC|AB|MB|SK|NB|NL|PE|YT|NT|NU)\b/i;
const FOREIGN_WORKDAY = /(?:^|[\s~])(?!US-)[A-Z]{2}-[A-Z0-9]{2,}/;
const NON_US_COUNTRIES =
  /\b(canada|united\s+kingdom|uk|england|australia|india|germany|france|singapore|japan|china|brazil|mexico|méxico|netherlands|ireland|switzerland|sweden|spain|italy|italia|finland|denmark|norway|belgium|austria|new\s+zealand|\bnz\b|south\s+korea|hong\s+kong|taiwan|poland|israel|dubai|uae|emea|apac|europe|jiangsu)\b/i;
const NON_US_CITIES =
  /\b(london|sydney|toronto|vancouver|halifax|ottawa|montreal|calgary|edmonton|berlin|paris|tokyo|shanghai|beijing|dublin|amsterdam|zurich|stockholm|bangalore|bengaluru|mumbai|melbourne|hong\s+kong|singapore|mexico\s+city|sao\s+paulo|auckland|wuxi|queretaro|querétaro|pomigliano)\b/i;

export function isUsLocation(location: string | null | undefined): boolean {
  if (location == null) return false;

  const loc = location.trim();
  if (!loc) return false;

  // A foreign country, city, or Workday site code rejects the row even if a US token is also present.
  if (
    CANADA_WORKDAY.test(loc) ||
    FOREIGN_WORKDAY.test(loc) ||
    NON_US_COUNTRIES.test(loc) ||
    NON_US_CITIES.test(loc)
  ) {
    return false;
  }
  if (US_STATES.test(loc) || US_STATE_NAMES.test(loc) || US_INDICATORS.test(loc) || US_CITIES.test(loc)) {
    return true;
  }

  const compact = loc.toLowerCase().replace(/[^a-z]/g, "");
  return /sanfrancisco|sfnyc|nyc|seattle|losangeles|paloalto|mountainview|menlopark|newyork|california|pennsylvania|sanmateo|findlay|boston|chicago|austin|denver|atlanta|miami|dallas|houston|washington/.test(
    compact
  );
}

export function dedupHash(
  sourceName: SourceName,
  externalId: string,
  title: string,
  company: string
): string {
  const normTitle = normalizeForHash(title);
  const normCompany = normalizeForHash(company);
  const parts = externalId ? [sourceName, externalId, normTitle, normCompany] : [sourceName, normTitle, normCompany];
  const input = parts.join("|");
  return createHash("sha256").update(input).digest("hex");
}

export function contentHash(title: string, company: string, url?: string): string {
  const atsKey = canonicalAtsJobKey(url);
  const input = atsKey ?? `${canonicalizeTitleForHash(title)}|${canonicalizeCompanyForHash(company)}`;
  return createHash("sha256").update(input).digest("hex");
}