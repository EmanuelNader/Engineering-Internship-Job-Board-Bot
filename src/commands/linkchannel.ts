import { ChatInputCommandInteraction, SlashCommandBuilder, PermissionFlagsBits, ChannelType } from "discord.js";
import { prisma } from "@/db/client";
import { getEnabledRoleFamilies } from "@/config/roles.config";

const familyChoices = getEnabledRoleFamilies().map((f) => ({
  name: f.family,
  value: f.family,
}));

export const linkchannelCommand = new SlashCommandBuilder()
  .setName("linkchannel")
  .setDescription("[Admin] Bind a channel to a role family")
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
  .addStringOption((opt) =>
    opt.setName("family").setDescription("Role family").setRequired(true).addChoices(...familyChoices)
  )
  .addChannelOption((opt) =>
    opt.setName("channel").setDescription("Text channel").setRequired(true)
  );

export async function handleLinkChannel(interaction: ChatInputCommandInteraction): Promise<void> {
  const family = interaction.options.getString("family", true);
  const channel = interaction.options.getChannel("channel", true);

  if (channel.type !== ChannelType.GuildText && channel.type !== ChannelType.GuildAnnouncement) {
    await interaction.reply({ content: "Channel must be a text channel.", ephemeral: true });
    return;
  }

  if (!interaction.guildId) {
    await interaction.reply({ content: "Run /linkchannel in a server.", ephemeral: true });
    return;
  }

  await prisma.channelMap.upsert({
    where: {
      guildId_kind_roleFamily: { guildId: interaction.guildId, kind: "job", roleFamily: family },
    },
    create: { guildId: interaction.guildId, kind: "job", roleFamily: family, channelId: channel.id },
    update: { channelId: channel.id },
  });

  await interaction.reply({ content: `Linked #${channel.name} to \`${family}\` postings.`, ephemeral: true });
}
