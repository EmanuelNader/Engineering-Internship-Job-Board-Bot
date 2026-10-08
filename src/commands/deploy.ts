import { REST, Routes, Client, Guild } from "discord.js";
import { pingCommand } from "./ping";
import { roleCommand, unroleCommand } from "./role";
import { statusCommand } from "./status";
import { linkchannelCommand } from "./linkchannel";
import { setupCommand } from "./setup";
import { onboardCommand } from "./onboard";
import { settingsCommand } from "./settings";

const commands = [
  pingCommand, roleCommand, unroleCommand,
  statusCommand, linkchannelCommand, setupCommand, onboardCommand, settingsCommand,
].map((c) => c.toJSON());

/**
 * Publish slash commands once, for every server.
 * A second copy registered on the server makes Discord list each command twice.
 */
export async function deployCommands(client: Client, guild?: Guild): Promise<void> {
  const rest = new REST({ version: "10" }).setToken(process.env.DISCORD_TOKEN!);
  if (!client.user) {
    throw new Error("Cannot deploy commands before the Discord client is logged in.");
  }

  await rest.put(Routes.applicationCommands(client.user.id), { body: commands });
  console.log(`Deployed ${commands.length} global slash commands`);

  const guilds = guild ? [guild] : [...client.guilds.cache.values()];
  for (const target of guilds) {
    await rest.put(Routes.applicationGuildCommands(client.user.id, target.id), { body: [] });
    console.log(`Cleared server-specific slash commands in ${target.name} (${target.id})`);
  }
}
