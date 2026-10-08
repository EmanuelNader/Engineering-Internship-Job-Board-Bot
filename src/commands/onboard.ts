import {
  ChatInputCommandInteraction,
  EmbedBuilder,
  Guild,
  PermissionFlagsBits,
  SlashCommandBuilder,
} from "discord.js";
import { ensureGuildSetup } from "@/provisioner/index";
import { getEnabledRoleFamilies, OVERVIEW_CHANNEL_NAME } from "@/config/roles.config";
import { adapterConfigs } from "@/config/adapters.config";
import { prisma } from "@/db/client";
import { seedRecentPostingsForGuild } from "@/poster/seed";
import { ensureLiveSince, NEW_SERVER_FILL_DAYS } from "@/lib/live-since";
import { requestPostingStart } from "@/posting-runtime";
import type { RoleFamily } from "@/lib/types";
import type { Client } from "discord.js";

export const onboardCommand = new SlashCommandBuilder()
  .setName("onboard")
  .setDescription("[Admin] Choose which channels to create and which to fill")
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator);

function sourceBlurb(): string {
  const enabled = adapterConfigs.filter((c) => c.enabled).map((c) => c.name);
  const labels: Record<string, string> = {
    github: "GitHub internship READMEs",
    greenhouse: "Greenhouse career boards",
    ashby: "Ashby boards",
    lever: "Lever boards",
    workday: "Workday",
    icims: "iCIMS",
  };
  return enabled
    .filter((name) => labels[name])
    .map((name) => `• ${labels[name]}`)
    .join("\n");
}

export function buildOnboardEmbed(families?: RoleFamily[]): EmbedBuilder {
  const chosen = new Set(families ?? getEnabledRoleFamilies().map((family) => family.family));
  const reactions = getEnabledRoleFamilies()
    .filter((family) => chosen.has(family.family))
    .map((f) => `${f.emoji}  ${f.overviewLabel ?? f.roleName}  \`#${f.channelName}\``)
    .join("\n");

  return new EmbedBuilder()
    .setTitle("Engineering intern job board")
    .setColor(0x5865f2)
    .setDescription(
      [
        "This bot watches public internship lists and company career pages, keeps **US intern / co-op / fellowship** roles, and posts them into the matching channel below.",
        "",
        `This is \`#${OVERVIEW_CHANNEL_NAME}\` — react here for pings. Listings never post in this channel.`,
        "",
        "React with an emoji to get pinged when a new listing lands in that family. Remove the reaction to stop pings. You can also use `/role` / `/unrole`.",
      ].join("\n")
    )
    .addFields(
      { name: "What it scrapes", value: sourceBlurb() },
      { name: "Choose your pings", value: reactions }
    );
}

export async function applyOnboardChoices(
  guild: Guild,
  client: Client,
  createFamilies: RoleFamily[],
  fillFamilies: RoleFamily[]
): Promise<{ overviewId: string }> {
  const fill = fillFamilies.filter((family) => createFamilies.includes(family));
  const overview = await ensureGuildSetup(guild, createFamilies);
  if (createFamilies.length === 0) {
    await prisma.channelMap.deleteMany({ where: { guildId: guild.id, kind: "job" } });
  } else {
    await prisma.channelMap.deleteMany({
      where: { guildId: guild.id, kind: "job", roleFamily: { notIn: createFamilies } },
    });
  }

  await removePreviousPanel(guild.id, guild);

  const embed = buildOnboardEmbed(createFamilies);
  const message = await overview.send({ embeds: [embed] });
  for (const family of getEnabledRoleFamilies()) {
    if (!createFamilies.includes(family.family)) continue;
    await message.react(family.emoji);
  }

  await prisma.onboardPanel.upsert({
    where: { guildId: guild.id },
    create: {
      guildId: guild.id,
      channelId: overview.id,
      messageId: message.id,
    },
    update: {
      channelId: overview.id,
      messageId: message.id,
    },
  });

  await ensureLiveSince(guild.id, new Date(), NEW_SERVER_FILL_DAYS);
  await requestPostingStart();

  if (fill.length > 0) {
    void seedRecentPostingsForGuild(client, guild.id, fill).catch((err) => {
      console.error("Failed to seed job channels after /onboard:", err);
    });
  }

  return { overviewId: overview.id };
}

export async function handleOnboard(interaction: ChatInputCommandInteraction): Promise<void> {
  const { presentCreateStep } = await import("@/commands/onboard-picker");
  await presentCreateStep(interaction);
}

async function removePreviousPanel(guildId: string, guild: Guild): Promise<void> {
  const previous = await prisma.onboardPanel.findUnique({ where: { guildId } });
  if (!previous) return;
  try {
    const channel = await guild.channels.fetch(previous.channelId);
    if (!channel || !channel.isTextBased()) return;
    const oldMessage = await channel.messages.fetch(previous.messageId);
    await oldMessage.delete();
  } catch {
    // Old panel already gone (deleted channel, missing message, etc.)
  }
}
