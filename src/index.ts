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
import { createListingsSync, installListingsSync } from "@/listings/sync";
import { rememberPostedJobs } from "@/poster/claim";
import { adoptLegacyGuildData } from "@/poster/adopt";
import { registerPostingStart } from "@/posting-runtime";
import { retireGreenhousePostings } from "@/poster/retire";
import { handleOnboardComponent } from "@/commands/onboard-picker";

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

async function startPosting() {
  if (postingStarted) return;
  const states = await prisma.guildState.findMany();
  if (states.length === 0) {
    console.log("Waiting for /onboard before scraping.");
    return;
  }
  postingStarted = true;
  try {
    await adoptLegacyGuildData(client);
    await rememberPostedJobs();
    const liveSince = states.reduce(
      (earliest, state) => (state.liveSince < earliest ? state.liveSince : earliest),
      states[0].liveSince
    );
    console.log(`Only posting jobs published on or after ${liveSince.toISOString().slice(0, 10)}`);

    poster = new Poster(client, prisma);
    const sendPosting: Poster["send"] = (posting, hash, guildId) =>
      poster!.send(posting, hash, guildId).then((value) => {
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

    manager = new SourcesManager(
      getAllAdapters(),
      sendPosting,
      (source, error) => console.error(`[${source}] ${error.message}`),
      liveSince,
      async (adapter) => {
        if (adapter.name !== "greenhouse") return;
        const removed = await retireGreenhousePostings(client, adapter.liveJobIdsByBoard);
        if (removed > 0) listingsSync.schedule();
      }
    );
    manager.start();
    console.log("SourcesManager started");
    void listingsSync.flush();
  } catch (err) {
    postingStarted = false;
    throw err;
  }
}

registerPostingStart(startPosting);

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

    if (client.guilds.cache.size === 0) {
      console.log("Waiting to join a server before scraping.");
      return;
    }
    await startPosting();
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
      if (clientReady) await startPosting();
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
  } else if (
    (interaction.isStringSelectMenu() || interaction.isButton()) &&
    interaction.customId.startsWith("onboard:")
  ) {
    await handleOnboardComponent(interaction);
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
