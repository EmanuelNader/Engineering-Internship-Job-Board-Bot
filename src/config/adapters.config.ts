import type { SourceName } from "@/lib/types";

/**
 * Default boards this bot polls. Not secrets — self-hosters should edit this file.
 * Greenhouse/Ashby/Lever: public job-board slugs. Workday: slug plus matching workdayBoards.
 * iCIMS: company name plus careers-*.icims.com host (non-tech / traditional engineering).
 * GitHub: owner/repo or owner/repo#path.md intern-list READMEs.
 * Work at a Startup: role filters (eng, marketing). Marketing internships only post when the title is growth.
 */

export interface WorkdayBoard {
  name: string;
  host: string;
  tenant: string;
  site: string;
}

export interface IcimsBoard {
  name: string;
  host: string;
}

export interface AdapterConfig {
  name: SourceName;
  enabled: boolean;
  pollIntervalSec: number;
  companies: string[]; // company slugs for ATS; owner/repo[#path] for GitHub
  workdayBoards?: WorkdayBoard[];
  icimsBoards?: IcimsBoard[];
}

export const adapterConfigs: AdapterConfig[] = [
  { name: "greenhouse", enabled: true, pollIntervalSec: 300, companies: [
    "spacex", "andurilindustries", "airtable", "airbnb", "figma", "twitch", "neuralink",
    "robinhood", "xai", "anthropic", "reddit", "cloudflare", "scaleai", "lyft",
    "stripe", "discord", "brex", "squarespace", "clear", "affirm",
    "crunchyroll", "nuro", "pallet", "pinterest", "astranis", "waymo", "figureai", "merge",
    "databricks", "datadog", "dropbox", "instacart", "mongodb", "twilio", "block",
    "gitlab", "vercel", "togetherai", "hightouch", "roblox",
    "jumptrading", "akunacapital", "optiver", "imc", "chicagotrading",
    "coinbase",
    "asana", "okta", "hubspot", "flexport", "chime", "sofi",
    "rocketlab", "relativity", "lucidmotors", "vast",
  ]},
  { name: "ashby", enabled: true, pollIntervalSec: 300, companies: [
    "chalk", "notion", "ramp", "snowflake", "decagon", "distyl", "elevenlabs",
    "baseten", "browserbase", "clickup", "apex-technology-inc", "light",
    "linear", "sift", "gigaml", "sesame", "granola", "sunday",
    "openai", "perplexity", "pylon", "cohere", "traversal", "harvey", "sentry", "braintrust",
    "eliseai", "mintlify", "roadrunner", "supabase", "wispr-flow", "flint",
    "cursor", "langchain", "cognition", "paraform",
    "saronic", "plaid", "exa", "trajectory", "krea",
    "vizcom", "posthog", "sierra", "workweave", "reducto", "console", "salient",
    "replit", "vanta", "mercury",
  ]},
  { name: "lever", enabled: true, pollIntervalSec: 300, companies: [
    "palantir", "spotify", "zoox", "belvederetrading",
  ]},
  { name: "workday", enabled: true, pollIntervalSec: 300, companies: [
    "nvidia", "adobe", "salesforce", "paypal", "blue-origin", "disney", "slack",
    "3m", "abbott",
    "caterpillar", "qualcomm", "applied-materials", "rtx", "dupont", "chevron",
    "boeing", "ge-aerospace",
    "baker-hughes", "dow", "marathon-petroleum", "motiva", "williams",
  ], workdayBoards: [
    { name: "NVIDIA", host: "nvidia.wd5.myworkdayjobs.com", tenant: "nvidia", site: "NVIDIAExternalCareerSite" },
    { name: "Adobe", host: "adobe.wd5.myworkdayjobs.com", tenant: "adobe", site: "external_experienced" },
    { name: "Salesforce", host: "salesforce.wd12.myworkdayjobs.com", tenant: "salesforce", site: "External_Career_Site" },
    { name: "PayPal", host: "paypal.wd1.myworkdayjobs.com", tenant: "paypal", site: "jobs" },
    { name: "Blue Origin", host: "blueorigin.wd5.myworkdayjobs.com", tenant: "blueorigin", site: "BlueOrigin" },
    { name: "Disney", host: "disney.wd5.myworkdayjobs.com", tenant: "disney", site: "disneycareer" },
    { name: "Slack", host: "salesforce.wd12.myworkdayjobs.com", tenant: "salesforce", site: "Slack" },
    { name: "3M", host: "3m.wd1.myworkdayjobs.com", tenant: "3m", site: "Search" },
    { name: "Abbott", host: "abbott.wd5.myworkdayjobs.com", tenant: "abbott", site: "abbottcareers" },
    { name: "Caterpillar", host: "cat.wd5.myworkdayjobs.com", tenant: "cat", site: "CaterpillarCareers" },
    { name: "Qualcomm", host: "qualcomm.wd12.myworkdayjobs.com", tenant: "qualcomm", site: "External" },
    { name: "Applied Materials", host: "amat.wd1.myworkdayjobs.com", tenant: "amat", site: "External" },
    { name: "RTX", host: "globalhr.wd5.myworkdayjobs.com", tenant: "globalhr", site: "REC_RTX_Ext_Gateway" },
    { name: "DuPont", host: "dupont.wd5.myworkdayjobs.com", tenant: "dupont", site: "Jobs" },
    { name: "Chevron", host: "chevron.wd5.myworkdayjobs.com", tenant: "chevron", site: "jobs" },
    { name: "Boeing", host: "boeing.wd1.myworkdayjobs.com", tenant: "boeing", site: "INTERN" },
    { name: "GE Aerospace", host: "geaerospace.wd5.myworkdayjobs.com", tenant: "geaerospace", site: "GE_ExternalSite" },
    { name: "Baker Hughes", host: "bakerhughes.wd5.myworkdayjobs.com", tenant: "bakerhughes", site: "bakerhughes" },
    { name: "Dow", host: "dow.wd1.myworkdayjobs.com", tenant: "dow", site: "ExternalCareers" },
    { name: "Marathon Petroleum", host: "mpc.wd1.myworkdayjobs.com", tenant: "mpc", site: "MPCCareers" },
    { name: "Motiva", host: "motiva.wd1.myworkdayjobs.com", tenant: "motiva", site: "MotivaCareers" },
    { name: "Williams", host: "williams.wd5.myworkdayjobs.com", tenant: "williams", site: "External" },
  ]},
  { name: "icims", enabled: true, pollIntervalSec: 300, companies: [
    "kimley-horn", "dewberry", "cec", "kci", "rsandh", "gft", "sargent-lundy", "gdms",
  ], icimsBoards: [
    { name: "Kimley-Horn", host: "careers-kimley-horn.icims.com" },
    { name: "Dewberry", host: "careers-dewberry.icims.com" },
    { name: "CEC", host: "careers-cecinc.icims.com" },
    { name: "KCI", host: "careers-kci.icims.com" },
    { name: "RS&H", host: "careers-rsandh.icims.com" },
    { name: "GFT", host: "careers-gannettfleming.icims.com" },
    { name: "Sargent & Lundy", host: "careers-sargentlundy.icims.com" },
    { name: "GD Mission Systems", host: "careers-gdms.icims.com" },
  ]},
  { name: "simplify", enabled: false, pollIntervalSec: 900, companies: [] },
  { name: "workatastartup", enabled: true, pollIntervalSec: 900, companies: ["eng", "marketing"] },
  { name: "github", enabled: true, pollIntervalSec: 900, companies: [
    "SimplifyJobs/Summer2027-Internships",
    "SimplifyJobs/Summer2027-Internships#README-Off-Season.md",
    "vanshb03/Summer2027-Internships",
    "speedyapply/2027-SWE-College-Jobs",
  ]},
  // Custom/proprietary ATS — scrapers not yet implemented
  { name: "custom", enabled: false, pollIntervalSec: 3600, companies: [
    "amazon", "microsoft", "meta", "apple", "google",
    "netflix", "oracle", "linkedin", "spotify", "bytedance-tiktok"
  ]},
];
