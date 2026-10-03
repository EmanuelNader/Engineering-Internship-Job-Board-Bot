# Deploy Runbook

This is a Discord bot, not a website. It needs a machine that stays on. No domain or public URL.

## Prerequisites

- A **separate** Discord application/token for production (do not reuse the local/dev bot)
- Invite the bot **before** starting it

Replace `CLIENT_ID` with the Application ID from the Discord Developer Portal:

```text
https://discord.com/oauth2/authorize?client_id=CLIENT_ID&permissions=2416004176&scope=bot%20applications.commands
```

Always invite with **both** `bot` and `applications.commands` (the URL above). Do **not** use Discord’s short “install” / user-install link — that is why `/` is empty on a new server. In the Developer Portal → **Installation**, Guild Install should include `bot` + `applications.commands` and the permission integer `2416004176`.

Put the bot’s role **above** the ping roles it creates, or reaction-role assignment fails.

No privileged Gateway Intents are required.

## Host with Docker (recommended)

On any always-on box with Docker (VPS, or a Mac/PC that stays awake):

```bash
git clone https://github.com/EmanuelNader/discord-internship-job-board-bot.git
cd discord-internship-job-board-bot
git checkout main
cp .env.example .env
```

Edit `.env`:

```env
DISCORD_TOKEN=your_prod_bot_token
GITHUB_TOKEN=your_github_pat
BACKFILL=true
BACKFILL_LIMIT=50
GITHUB_MAX_AGE_DAYS=14
INITIAL_LOOKBACK_DAYS=7
# Public list committed to this repo. Empty disables. Token needs Contents read and write.
LISTINGS_REPO=
LISTINGS_BRANCH=main
```

Compose overrides `DATABASE_URL` to a Docker volume (`/app/data/prod.db`). Do not point it at your laptop’s `prisma/dev.db`.

```bash
docker compose up -d --build
docker compose logs -f intern-board
```

You should see `Logged in as ...`, `Deployed … slash commands`, and `SourcesManager started`. If you see `Bot is not in any guild`, finish the invite and `docker compose restart`.

After the first seed, set `BACKFILL=false` in `.env` and `docker compose up -d`.

Updates:

```bash
git pull
docker compose up -d --build
```

If the pull changes channels or ping families, an admin must run **`/setup`** then **`/onboard`**. `/setup` creates new channels and ping roles; it does **not** delete leftover `#engineering-jobs`, `#design-jobs`, `#growth-jobs`, or `@Engineering` / `@Design` / `@Growth` — remove those in Discord if you no longer want them. Re-run `/onboard` so the reaction panel lists the new emojis, then drag the **job board** role above the new ping roles.

Turn families on or off with `enabled` in `src/config/roles.config.ts` (same idea as adapter `enabled`). In Discord, **`/settings`** lists those values. `LISTINGS_REPO` is optional; leave it empty to skip committing the public internship list.

SQLite lives in the `intern-board-data` volume. Back it up with:

```bash
docker compose cp intern-board:/app/data/prod.db "backups/prod-$(date +%Y%m%d-%H%M%S).db"
```

## Local development

```bash
cp .env.example .env
# Fill DISCORD_TOKEN. GITHUB_TOKEN is strongly recommended (GitHub rate limits).
# When LISTINGS_REPO is set, that token also needs contents write on the repo.
# DATABASE_URL file:./dev.db is created at prisma/dev.db (relative to the Prisma schema).
# Keep BACKFILL=false unless you intentionally want first-boot channel seeding.

npm ci
npx prisma migrate deploy
npm test && npm run build
npm run dev
```

## VPS without Docker (PM2)

Node.js 20+. Do not run `npm ci --omit=dev` — the host compiles TypeScript.

Invite the bot first, then:

```bash
git clone https://github.com/EmanuelNader/discord-internship-job-board-bot.git
cd discord-internship-job-board-bot
git checkout main
npm ci
npx prisma migrate deploy
npm run build
```

Create `.env` on the host (never commit it):

```env
DISCORD_TOKEN=your_prod_bot_token
DATABASE_URL="file:./prod.db"
GITHUB_TOKEN=your_github_pat
BACKFILL=true
BACKFILL_LIMIT=50
GITHUB_MAX_AGE_DAYS=14
# Public list committed to this repo. Empty disables. Token needs Contents read and write.
LISTINGS_REPO=
LISTINGS_BRANCH=main
```

`DATABASE_URL="file:./prod.db"` is stored at **`prisma/prod.db`**, not the repo root.

Use `BACKFILL=true` **only on first boot**. PM2 sets `NODE_ENV=production` in `ecosystem.config.cjs` — do not export `NODE_ENV=production` before `npm ci`.

```bash
npm i -g pm2
pm2 start ecosystem.config.cjs
pm2 save
pm2 startup   # follow the printed command to enable boot persistence
pm2 logs intern-board
```

## First-boot Discord smoke

1. Confirm the bot is online (logs / Discord member list).
2. Run **`/onboard`** anywhere in the server (Administrator). Join/boot does not create channels. `/onboard` creates `#job-board` plus the enabled job channels + ping roles if missing, posts the welcome embed in `#job-board` (not in the channel you typed in), and adds family emoji reactions.
3. React to an emoji and confirm you received the family ping roles.
4. With `BACKFILL=true`, confirm job embeds appear in channels (sends are rate-limited ~1 / 2s).
5. Set `BACKFILL=false` in `.env`, then restart (`docker compose up -d` or `pm2 restart intern-board`).
6. Exercise `/status`, `/ping`, `/role`, `/unrole`.
7. Wait one scheduler poll cycle — same jobs must **not** duplicate.

## Ops notes

- Keep **separate Discord applications** (and tokens) for production vs local/dev.
- If a token leaks, rotate it in the Discord Developer Portal and update `.env` + restart.
- This process posts to the server where you last ran `/setup`. Slash commands register on every guild the bot is in.
- PM2 SQLite backup (non-Docker): `mkdir -p backups && cp prisma/prod.db "backups/prod-$(date +%Y%m%d-%H%M%S).db"`.
- PM2 updates: `git pull && npm ci && npx prisma migrate deploy && npm run build && pm2 restart intern-board`. After a pull that changes channels or ping families, run **`/setup`** then **`/onboard`**. Leftover `#engineering-jobs` / `#design-jobs` / `#growth-jobs` can be deleted in Discord.
