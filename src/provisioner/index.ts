import { Guild, TextChannel } from "discord.js";
import { getEnabledRoleFamilies, OVERVIEW_CHANNEL_NAME } from "@/config/roles.config";
import { prisma } from "@/db/client";
import type { RoleFamily } from "@/lib/types";

export async function ensureGuildSetup(guild: Guild, onlyFamilies?: RoleFamily[]): Promise<TextChannel> {
  const existingChannels = await guild.channels.fetch();
  const existingRoles = await guild.roles.fetch();

  let overview = existingChannels.find((c) => c?.name === OVERVIEW_CHANNEL_NAME);
  if (!overview) {
    overview = await guild.channels.create({
      name: OVERVIEW_CHANNEL_NAME,
      type: 0, // GuildText
      topic: "React here for internship pings. New listings post in the family channels.",
      position: 0,
    });
  }
  if (!overview.isTextBased() || overview.isDMBased()) {
    throw new Error(`#${OVERVIEW_CHANNEL_NAME} exists but is not a text channel.`);
  }

  const chosen = new Set(onlyFamilies ?? getEnabledRoleFamilies().map((family) => family.family));
  for (const family of getEnabledRoleFamilies()) {
    if (!chosen.has(family.family)) continue;
    const channelName = family.channelName;
    let channel = existingChannels.find((c) => c?.name === channelName);

    if (!channel) {
      channel = await guild.channels.create({
        name: channelName,
        type: 0, // GuildText
        topic: `${family.roleName} internship postings`,
      });
    }

    await prisma.channelMap.upsert({
      where: {
        guildId_kind_roleFamily: { guildId: guild.id, kind: "job", roleFamily: family.family },
      },
      create: {
        guildId: guild.id,
        kind: "job",
        roleFamily: family.family,
        channelId: channel.id,
      },
      update: { channelId: channel.id },
    });

    let pingRole = existingRoles.find((r) => r?.name === family.roleName);
    if (!pingRole) {
      pingRole = await guild.roles.create({
        name: family.roleName,
        mentionable: true,
        reason: `Auto-provisioned ping role for ${family.family}`,
      });
    }

    for (const title of family.titles) {
      const leftover = existingRoles.find((r) => r?.name === title.roleName);
      if (leftover && leftover.name !== family.roleName && "delete" in leftover) {
        try {
          await leftover.delete("Collapsed title ping roles into family roles");
        } catch (err) {
          console.error(`Failed to delete leftover role ${title.roleName}:`, err);
        }
      }
    }
  }

  return overview as TextChannel;
}
