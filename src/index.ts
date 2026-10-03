import "dotenv/config";
import { validateEnv } from "@/config/env";
import { Client, GatewayIntentBits, Events, Partials } from "discord.js";
import { SourcesManager } from "@/scheduler/index";
import { getAllAdapters } from "@/adapters/index";
import { prisma } from "@/db/client";
import { runBackfill } from "@/scheduler/backfill";
import { deployCommands } from "@/commands/deploy";
import { handleInteraction, handleAutocomplete } from "@/commands/index";
import { handleOnboardReaction } from "@/commands/onboard-reactions";
import { Poster } from "@/poster/index";
import { seedRecentPostings } from "@/poster/seed";
import { ensureLiveSince } from "@/lib/live-since";
import { createListingsSync, installListingsSync } from "@/listings/sync";

const env = validateEnv();
const listingsSync = createListingsSync({
  token: env.GITHUB_TOKEN,
  repo: env.LISTINGS_REPO,
  branch: env.LISTINGS_BRANCH,
});
installListingsSync(listingsSync);

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.GuildMessageReactions,
  ],
  partials: [Partials.Message, Partials.Channel, Partials.Reaction],
});

let manager: SourcesManager | null = null;
let poster: Poster | null = null;
let clientReady = false;
let postingStarted = false;

async function startPosting(guildId: string) {
  if (postingStarted) return;
  postingStarted = true;
  try {
    const liveSince = await ensureLiveSince(guildId, new Date(), env.INITIAL_LOOKBACK_DAYS);
    console.log(`Only posting jobs published on or after ${liveSince.toISOString().slice(0, 10)}`);

    poster = new Poster(client, prisma);
    const sendPosting: Poster["send"] = (posting, hash) =>
      poster!.send(posting, hash).then((value) => {
        listingsSync.schedule();
        return value;
      });

    if (env.BACKFILL) {
      console.log(`Running backfill (limit ${env.BACKFILL_LIMIT} per source)...`);
      await runBackfill(
        { enabled: true, limitPerSource: env.BACKFILL_LIMIT, liveSince },
        sendPosting
      );
      console.log("Backfill complete");
    }

    const seeded = await seedRecentPostings(sendPosting, liveSince);
    if (seeded.sent > 0 || seeded.skipped > 0) {
      console.log(`Seeded ${seeded.sent} jobs into mapped channels (${seeded.skipped} already delivered)`);
    }

    manager = new SourcesManager(
      getAllAdapters(),
      sendPosting,
      (source, error) => console.error(`[${source}] ${error.message}`),
      liveSince
    );
    manager.start();
    console.log("SourcesManager started");
  } catch (err) {
    postingStarted = false;
    throw err;
  }
}

async function shutdown(signal: string) {
  console.log(`Received ${signal}, shutting down...`);
  listingsSync.stop();
  manager?.stop();
  poster?.stop();
  await prisma.$disconnect();
  client.destroy();
  process.exit(0);
}

process.once("SIGINT", () => void shutdown("SIGINT"));
process.once("SIGTERM", () => void shutdown("SIGTERM"));

client.once(Events.ClientReady, async () => {
  try {
    console.log(`Logged in as ${client.user?.tag}`);

    // Single-guild: extra Discord servers the bot is in are ignored for scrape window.
    await client.guilds.fetch();
    if (client.guilds.cache.size === 0) {
      console.warn(
        "Bot is not in any guild yet. Invite it with the bot and applications.commands scopes; slash commands deploy on join."
      );
    }
    if (client.guilds.cache.size > 1) {
      console.warn(
        `Bot is in ${client.guilds.cache.size} guilds; slash commands deploy to all of them. /setup and /onboard apply to the server you run them in.`
      );
    }

    // Commands first, then mark ready so a join during backfill still gets /commands.
    await deployCommands(client);
    clientReady = true;

    const guild = client.guilds.cache.first();
    if (!guild) {
      console.log("Waiting to join a server before scraping.");
      return;
    }
    await startPosting(guild.id);
  } catch (err) {
    console.error("Startup failed:", err);
    process.exit(1);
  }
});

client.on(Events.GuildCreate, (guild) => {
  void (async () => {
    console.log(`Joined ${guild.name} (${guild.id}); deploying slash commands`);
    try {
      await deployCommands(client, guild);
      if (clientReady) await startPosting(guild.id);
    } catch (err) {
      console.error(`Failed to finish join for ${guild.id}:`, err);
    }
  })();
});

client.on(Events.InteractionCreate, async (interaction) => {
  if (interaction.isChatInputCommand()) {
    await handleInteraction(interaction);
  } else if (interaction.isAutocomplete()) {
    await handleAutocomplete(interaction);
  }
});

client.on(Events.MessageReactionAdd, (reaction, user) => {
  void handleOnboardReaction(reaction, user, true);
});

client.on(Events.MessageReactionRemove, (reaction, user) => {
  void handleOnboardReaction(reaction, user, false);
});

void Promise.resolve(client.login(env.DISCORD_TOKEN)).catch((err) => {
  console.error("Login failed:", err);
  process.exit(1);
});
