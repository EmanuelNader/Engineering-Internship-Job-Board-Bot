# How the bot works

[Job list](../README.md) · [What it scrapes](SOURCES.md) · [Add to Discord](https://discord.com/oauth2/authorize?client_id=1531088961387237477&permissions=2416004176&scope=bot%20applications.commands)

Public Discord bot that watches public intern lists and company career pages, keeps **US intern / co-op / fellowship** roles, and posts each new listing into the role-family channels that server chose (SWE, PM, Hardware, Data, ML, Civil/Structural, Mechanical, Electrical, Chemical, Aerospace, Other). Members react on the `/onboard` panel (or use `/role`) to get pinged.

[Add it to a server](https://discord.com/oauth2/authorize?client_id=1531088961387237477&permissions=2416004176&scope=bot%20applications.commands). An admin then runs `/onboard`. Joining does not create channels or post old jobs.

`/onboard` is private to that admin:

1. Choose which family channels to create. `#job-board` is always created. Listings never post there.
2. Choose which of those to fill. **Create and fill** fills the ones you leave selected. **Create without filling** leaves them empty until a new internship shows up.

A new server is filled from the **last 7 days**, **oldest first, newest last**. Only United States locations are included. The same apply link, or the same company and cleaned title, is not posted twice in that server. A role that fits two families posts only in the channels that server turned on. Another server can still receive it.

Each posted role is also added to the [job list](../README.md).

The rest of this page is for running your own copy. The hosted bot is the invite link above.

## What you need

- Node.js 20+ (or Docker)
- A Discord application + bot token
- A GitHub personal access token (optional, strongly recommended — public GitHub API rate limits)

Invite URL (replace `CLIENT_ID` with the Application ID):

```text
https://discord.com/oauth2/authorize?client_id=CLIENT_ID&permissions=2416004176&scope=bot%20applications.commands
```

Use that full URL (both `bot` and `applications.commands`). Discord’s short “install” link is user-install only — `/` will be empty on a new server.

That grant is: View Channels, Manage Channels, Manage Roles, Send Messages, Embed Links, Add Reactions, Read Message History, Use Application Commands.

Put the bot’s role **above** the ping roles it creates, or reaction-role assignment fails. No privileged Gateway Intents are required.

## Quick start (Docker)

Full server runbook: **[DEPLOY.md](DEPLOY.md)**.

```bash
cp .env.example .env
# Set DISCORD_TOKEN. Set GITHUB_TOKEN if you have one.
docker compose up -d --build
```

Invite the bot **before** the first start. Joining does **not** create channels. An admin runs **`/onboard`**, picks which channels to create, then which of those to fill. Fill for a new server is US internships from the **last 7 days**, oldest first. The reaction panel is posted in `#job-board`, not in `#general`.

Use `BACKFILL=true` only if you want an extra first-boot seed pass, then set it back to `false` and restart. Compose stores SQLite in the `intern-board-data` volume — do not point `DATABASE_URL` at your laptop `prisma/dev.db`.

## Local development

```bash
cp .env.example .env
npm ci
npx prisma migrate deploy
npm test && npm run build
npm run dev
```

`.env.example` documents every variable. Never commit `.env`.

## Commands

| Command | Who | What |
| --- | --- | --- |
| `/onboard` | Admin | Choose which channels to create and which to fill, then post the reaction panel in `#job-board` |
| `/role` `/unrole` | Anyone | Join or leave a family ping role |
| `/status` | Anyone | Adapter health |
| `/ping` | Anyone | Liveness |
| `/setup` `/linkchannel` | Admin | Repair the channels this server already chose / remap one channel |
| `/settings` | Admin | Show which families are on and which channel they use |

## Config

- Boards the bot polls: [What it scrapes](SOURCES.md) and [`src/config/adapters.config.ts`](../src/config/adapters.config.ts)
- Channels and ping roles: [`src/config/roles.config.ts`](../src/config/roles.config.ts)
- Public list: the [README](../README.md), plus [`internships.md`](internships.md) and [`data/listings.json`](../data/listings.json)

When `LISTINGS_REPO` is set (`owner/repo`), each role that lands in a family channel is added to that list and committed to `LISTINGS_BRANCH` (default `main`). `GITHUB_TOKEN` needs contents write on the repo. Leave `LISTINGS_REPO` empty to keep Discord-only.

See [CONTRIBUTING.md](../CONTRIBUTING.md) to add a company. Report vulnerabilities via [SECURITY.md](../SECURITY.md) — never paste tokens in issues.

## License

MIT. See [LICENSE](../LICENSE).
