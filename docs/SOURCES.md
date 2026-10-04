# What it scrapes

[Job list](../README.md) · [How the bot works](BOT.md)

Only **US intern / co-op / fellowship** rows are posted. Each name below links to the board or repo the bot polls. Defaults live in [`src/config/adapters.config.ts`](../src/config/adapters.config.ts).

| Source | What | On |
| --- | --- | --- |
| GitHub intern lists | README tables (many companies beyond the ATS boards) | yes |
| Greenhouse | Company career boards | yes (56) |
| Ashby | Company career boards | yes (51) |
| Lever | Company career boards | yes (4) |
| Workday | Company career boards | yes (22) |
| iCIMS | Non-tech engineering career boards | yes (8) |
| Simplify HTML | Job-board HTML scrape | no |
| Custom ATS | Amazon, Microsoft, Meta, Apple, Google, Netflix, Oracle, LinkedIn, ByteDance | no (stub) |

### GitHub intern lists

| Repo | Files |
| --- | --- |
| [SimplifyJobs/Summer2027-Internships](https://github.com/SimplifyJobs/Summer2027-Internships) | `README.md`, `README-Off-Season.md` |
| [vanshb03/Summer2027-Internships](https://github.com/vanshb03/Summer2027-Internships) | `README.md` |
| [speedyapply/2027-SWE-College-Jobs](https://github.com/speedyapply/2027-SWE-College-Jobs) | `README.md` |

### Greenhouse

[Affirm](https://job-boards.greenhouse.io/affirm) · [Airbnb](https://job-boards.greenhouse.io/airbnb) · [Airtable](https://job-boards.greenhouse.io/airtable) · [Akuna Capital](https://job-boards.greenhouse.io/akunacapital) · [Anduril](https://job-boards.greenhouse.io/andurilindustries) · [Anthropic](https://job-boards.greenhouse.io/anthropic) · [Asana](https://job-boards.greenhouse.io/asana) · [Astranis](https://job-boards.greenhouse.io/astranis) · [Block](https://job-boards.greenhouse.io/block) · [Brex](https://job-boards.greenhouse.io/brex) · [Chicago Trading](https://job-boards.greenhouse.io/chicagotrading) · [Chime](https://job-boards.greenhouse.io/chime) · [CLEAR](https://job-boards.greenhouse.io/clear) · [Cloudflare](https://job-boards.greenhouse.io/cloudflare) · [Coinbase](https://job-boards.greenhouse.io/coinbase) · [Crunchyroll](https://job-boards.greenhouse.io/crunchyroll) · [Databricks](https://job-boards.greenhouse.io/databricks) · [Datadog](https://job-boards.greenhouse.io/datadog) · [Discord](https://job-boards.greenhouse.io/discord) · [Dropbox](https://job-boards.greenhouse.io/dropbox) · [Figma](https://job-boards.greenhouse.io/figma) · [Figure](https://job-boards.greenhouse.io/figureai) · [Flexport](https://job-boards.greenhouse.io/flexport) · [GitLab](https://job-boards.greenhouse.io/gitlab) · [Hightouch](https://job-boards.greenhouse.io/hightouch) · [HubSpot](https://job-boards.greenhouse.io/hubspot) · [IMC](https://job-boards.greenhouse.io/imc) · [Instacart](https://job-boards.greenhouse.io/instacart) · [Jump Trading](https://job-boards.greenhouse.io/jumptrading) · [Lucid Motors](https://job-boards.greenhouse.io/lucidmotors) · [Lyft](https://job-boards.greenhouse.io/lyft) · [Merge](https://job-boards.greenhouse.io/merge) · [MongoDB](https://job-boards.greenhouse.io/mongodb) · [Neuralink](https://job-boards.greenhouse.io/neuralink) · [Nuro](https://job-boards.greenhouse.io/nuro) · [Okta](https://job-boards.greenhouse.io/okta) · [Optiver](https://job-boards.greenhouse.io/optiver) · [Pallet](https://job-boards.greenhouse.io/pallet) · [Pinterest](https://job-boards.greenhouse.io/pinterest) · [Reddit](https://job-boards.greenhouse.io/reddit) · [Relativity Space](https://job-boards.greenhouse.io/relativity) · [Robinhood](https://job-boards.greenhouse.io/robinhood) · [Roblox](https://job-boards.greenhouse.io/roblox) · [Rocket Lab](https://job-boards.greenhouse.io/rocketlab) · [Scale AI](https://job-boards.greenhouse.io/scaleai) · [SoFi](https://job-boards.greenhouse.io/sofi) · [SpaceX](https://job-boards.greenhouse.io/spacex) · [Squarespace](https://job-boards.greenhouse.io/squarespace) · [Stripe](https://job-boards.greenhouse.io/stripe) · [Together AI](https://job-boards.greenhouse.io/togetherai) · [Twilio](https://job-boards.greenhouse.io/twilio) · [Twitch](https://job-boards.greenhouse.io/twitch) · [Vast](https://job-boards.greenhouse.io/vast) · [Vercel](https://job-boards.greenhouse.io/vercel) · [Waymo](https://job-boards.greenhouse.io/waymo) · [xAI](https://job-boards.greenhouse.io/xai)

### Ashby

[Apex](https://jobs.ashbyhq.com/apex-technology-inc) · [Baseten](https://jobs.ashbyhq.com/baseten) · [Braintrust](https://jobs.ashbyhq.com/braintrust) · [Browserbase](https://jobs.ashbyhq.com/browserbase) · [Chalk](https://jobs.ashbyhq.com/chalk) · [ClickUp](https://jobs.ashbyhq.com/clickup) · [Cognition](https://jobs.ashbyhq.com/cognition) · [Cohere](https://jobs.ashbyhq.com/cohere) · [Console](https://jobs.ashbyhq.com/console) · [Cursor](https://jobs.ashbyhq.com/cursor) · [Decagon](https://jobs.ashbyhq.com/decagon) · [Distyl](https://jobs.ashbyhq.com/distyl) · [ElevenLabs](https://jobs.ashbyhq.com/elevenlabs) · [EliseAI](https://jobs.ashbyhq.com/eliseai) · [Exa](https://jobs.ashbyhq.com/exa) · [Flint](https://jobs.ashbyhq.com/flint) · [GigaML](https://jobs.ashbyhq.com/gigaml) · [Granola](https://jobs.ashbyhq.com/granola) · [Harvey](https://jobs.ashbyhq.com/harvey) · [Krea](https://jobs.ashbyhq.com/krea) · [LangChain](https://jobs.ashbyhq.com/langchain) · [Light](https://jobs.ashbyhq.com/light) · [Linear](https://jobs.ashbyhq.com/linear) · [Mercury](https://jobs.ashbyhq.com/mercury) · [Mintlify](https://jobs.ashbyhq.com/mintlify) · [Notion](https://jobs.ashbyhq.com/notion) · [OpenAI](https://jobs.ashbyhq.com/openai) · [Paraform](https://jobs.ashbyhq.com/paraform) · [Perplexity](https://jobs.ashbyhq.com/perplexity) · [Plaid](https://jobs.ashbyhq.com/plaid) · [PostHog](https://jobs.ashbyhq.com/posthog) · [Pylon](https://jobs.ashbyhq.com/pylon) · [Ramp](https://jobs.ashbyhq.com/ramp) · [Reducto](https://jobs.ashbyhq.com/reducto) · [Replit](https://jobs.ashbyhq.com/replit) · [Roadrunner](https://jobs.ashbyhq.com/roadrunner) · [Salient](https://jobs.ashbyhq.com/salient) · [Saronic](https://jobs.ashbyhq.com/saronic) · [Sentry](https://jobs.ashbyhq.com/sentry) · [Sesame](https://jobs.ashbyhq.com/sesame) · [Sierra](https://jobs.ashbyhq.com/sierra) · [Sift](https://jobs.ashbyhq.com/sift) · [Snowflake](https://jobs.ashbyhq.com/snowflake) · [Sunday](https://jobs.ashbyhq.com/sunday) · [Supabase](https://jobs.ashbyhq.com/supabase) · [Trajectory](https://jobs.ashbyhq.com/trajectory) · [Traversal](https://jobs.ashbyhq.com/traversal) · [Vanta](https://jobs.ashbyhq.com/vanta) · [Vizcom](https://jobs.ashbyhq.com/vizcom) · [Wispr Flow](https://jobs.ashbyhq.com/wispr-flow) · [Workweave](https://jobs.ashbyhq.com/workweave)

### Lever

[Belvedere Trading](https://jobs.lever.co/belvederetrading) · [Palantir](https://jobs.lever.co/palantir) · [Spotify](https://jobs.lever.co/spotify) · [Zoox](https://jobs.lever.co/zoox)

### Workday

[3M](https://3m.wd1.myworkdayjobs.com/Search) · [Abbott](https://abbott.wd5.myworkdayjobs.com/abbottcareers) · [Adobe](https://adobe.wd5.myworkdayjobs.com/external_experienced) · [Applied Materials](https://amat.wd1.myworkdayjobs.com/External) · [Baker Hughes](https://bakerhughes.wd5.myworkdayjobs.com/bakerhughes) · [Blue Origin](https://blueorigin.wd5.myworkdayjobs.com/BlueOrigin) · [Boeing](https://boeing.wd1.myworkdayjobs.com/INTERN) · [Caterpillar](https://cat.wd5.myworkdayjobs.com/CaterpillarCareers) · [Chevron](https://chevron.wd5.myworkdayjobs.com/jobs) · [Disney](https://disney.wd5.myworkdayjobs.com/disneycareer) · [Dow](https://dow.wd1.myworkdayjobs.com/ExternalCareers) · [DuPont](https://dupont.wd5.myworkdayjobs.com/Jobs) · [GE Aerospace](https://geaerospace.wd5.myworkdayjobs.com/GE_ExternalSite) · [Marathon Petroleum](https://mpc.wd1.myworkdayjobs.com/MPCCareers) · [Motiva](https://motiva.wd1.myworkdayjobs.com/MotivaCareers) · [NVIDIA](https://nvidia.wd5.myworkdayjobs.com/NVIDIAExternalCareerSite) · [PayPal](https://paypal.wd1.myworkdayjobs.com/jobs) · [Qualcomm](https://qualcomm.wd12.myworkdayjobs.com/External) · [RTX](https://globalhr.wd5.myworkdayjobs.com/REC_RTX_Ext_Gateway) · [Salesforce](https://salesforce.wd12.myworkdayjobs.com/External_Career_Site) · [Slack](https://salesforce.wd12.myworkdayjobs.com/Slack) · [Williams](https://williams.wd5.myworkdayjobs.com/External)

### iCIMS (non-tech engineering)

Curated allowlist — intern/co-op search only, title-filtered.

[Kimley-Horn](https://careers-kimley-horn.icims.com/jobs/search?ss=1) · [Dewberry](https://careers-dewberry.icims.com/jobs/search?ss=1) · [CEC](https://careers-cecinc.icims.com/jobs/search?ss=1) · [KCI](https://careers-kci.icims.com/jobs/search?ss=1) · [RS&H](https://careers-rsandh.icims.com/jobs/search?ss=1) · [GFT](https://careers-gannettfleming.icims.com/jobs/search?ss=1) · [Sargent & Lundy](https://careers-sargentlundy.icims.com/jobs/search?ss=1) · [GD Mission Systems](https://careers-gdms.icims.com/jobs/search?ss=1)
