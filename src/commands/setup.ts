import { ChatInputCommandInteraction, SlashCommandBuilder, PermissionFlagsBits } from "discord.js";
import { ensureGuildSetup } from "@/provisioner/index";
import { getEnabledRoleFamilies, OVERVIEW_CHANNEL_NAME } from "@/config/roles.config";
import { prisma } from "@/db/client";
import type { RoleFamily } from "@/lib/types";

export const setupCommand = new SlashCommandBuilder()
  .setName("setup")
  .setDescription("[Admin] Recreate the channels this server already chose")
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator);

export async function handleSetup(interaction: ChatInputCommandInteraction): Promise<void> {
  await interaction.deferReply({ ephemeral: true });
  try {
    if (!interaction.guild) {
      await interaction.editReply({ content: "Run /setup in a server." });
      return;
    }

    const maps = await prisma.channelMap.findMany({
      where: { guildId: interaction.guild.id, kind: "job" },
    });
    const enabled = new Set(getEnabledRoleFamilies().map((family) => family.family));
    const families = maps
      .map((row) => row.roleFamily)
      .filter((family): family is RoleFamily => enabled.has(family as RoleFamily));

    if (families.length === 0) {
      await interaction.editReply({
        content: "No channels chosen yet. Run /onboard to pick which channels to create and which to fill.",
      });
      return;
    }

    await ensureGuildSetup(interaction.guild, families);
    await interaction.editReply({
      content: `Repaired \`#${OVERVIEW_CHANNEL_NAME}\` and the channels this server already chose. Run /onboard to change that list or post a new reaction panel.`,
    });
  } catch (err) {
    await interaction.editReply({ content: `Setup failed: ${(err as Error).message}` });
  }
}
