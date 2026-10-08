import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonInteraction,
  ButtonStyle,
  ChatInputCommandInteraction,
  PermissionFlagsBits,
  StringSelectMenuBuilder,
  StringSelectMenuInteraction,
} from "discord.js";
import { getEnabledRoleFamilies } from "@/config/roles.config";
import { NEW_SERVER_FILL_DAYS } from "@/lib/live-since";
import type { RoleFamily } from "@/lib/types";
import { applyOnboardChoices } from "@/commands/onboard";

const CREATE_ID = "onboard:create";
const FILL_ID = "onboard:fill";
const GO_ID = "onboard:go";
const EMPTY_ID = "onboard:empty";

const pending = new Map<string, { create: RoleFamily[]; fill: RoleFamily[] }>();

function key(guildId: string, userId: string): string {
  return `${guildId}:${userId}`;
}

function enabledFamilies() {
  return getEnabledRoleFamilies();
}

function pickerLabel(family: ReturnType<typeof enabledFamilies>[number]): string {
  const labels: Record<string, string> = {
    swe: "Software Engineering",
    "pm-program": "Product Management",
    hardware: "Hardware Engineering",
    data: "Data Science",
    ml: "Machine Learning",
    "civil-structural": "Civil and Structural",
    mechanical: "Mechanical Engineering",
    electrical: "Electrical Engineering",
    chemical: "Chemical Engineering",
    aerospace: "Aerospace Engineering",
    other: "Other (Design + Growth)",
  };
  return labels[family.family] ?? family.roleName;
}

function asFamilies(values: string[]): RoleFamily[] {
  const allowed = new Set(enabledFamilies().map((family) => family.family));
  return values.filter((value): value is RoleFamily => allowed.has(value as RoleFamily));
}

export function createStepContent(): string {
  return [
    "Which channels should I create?",
    "#job-board is always created. That is the hub. Listings never post there.",
    "",
    "Other is UX, product design, visual design, and growth marketing.",
  ].join("\n");
}

export function fillStepContent(fill: RoleFamily[]): string {
  const names = enabledFamilies()
    .filter((family) => fill.includes(family.family))
    .map((family) => `#${family.channelName}`);
  return [
    "Which of these should I fill with recent US internships?",
    "",
    `Recent means the last ${NEW_SERVER_FILL_DAYS} days for a new server.`,
    "Only United States locations are included.",
    "Messages go out oldest first, newest last.",
    "",
    names.length > 0 ? `Will fill:\n${names.join("\n")}` : "Will fill: none. New jobs still post in the channels you create.",
  ].join("\n");
}

function createMenu(): ActionRowBuilder<StringSelectMenuBuilder> {
  const families = enabledFamilies();
  return new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId(CREATE_ID)
      .setPlaceholder("Choose channels")
      .setMinValues(0)
      .setMaxValues(families.length)
      .addOptions(
        families.map((family) => ({
          label: pickerLabel(family),
          value: family.family,
          description:
            family.family === "other"
              ? "UX, product design, visual design, and growth marketing"
              : `#${family.channelName}`,
          emoji: { name: family.emoji },
        }))
      )
  );
}

function fillMenu(create: RoleFamily[]): ActionRowBuilder<StringSelectMenuBuilder> {
  const families = enabledFamilies().filter((family) => create.includes(family.family));
  return new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId(FILL_ID)
      .setPlaceholder("Channels to fill")
      .setMinValues(0)
      .setMaxValues(Math.max(families.length, 1))
      .addOptions(
        families.length > 0
          ? families.map((family) => ({
              label: `#${family.channelName}`,
              value: family.family,
              description: pickerLabel(family),
              emoji: { name: family.emoji },
            }))
          : [{ label: "No family channels", value: "none" }]
      )
  );
}

function fillButtons(): ActionRowBuilder<ButtonBuilder> {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId(GO_ID).setLabel("Create and fill").setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId(EMPTY_ID).setLabel("Create without filling").setStyle(ButtonStyle.Secondary)
  );
}

function isAdmin(interaction: StringSelectMenuInteraction | ButtonInteraction | ChatInputCommandInteraction): boolean {
  return Boolean(interaction.memberPermissions?.has(PermissionFlagsBits.Administrator));
}

export async function presentCreateStep(interaction: ChatInputCommandInteraction): Promise<void> {
  if (!interaction.guild || !interaction.guildId) {
    await interaction.reply({ content: "Run /onboard in a server.", ephemeral: true });
    return;
  }
  if (!isAdmin(interaction)) {
    await interaction.reply({ content: "Only an admin can onboard.", ephemeral: true });
    return;
  }
  pending.delete(key(interaction.guildId, interaction.user.id));
  await interaction.reply({
    content: createStepContent(),
    components: [createMenu()],
    ephemeral: true,
  });
}

export async function handleOnboardComponent(
  interaction: StringSelectMenuInteraction | ButtonInteraction
): Promise<void> {
  if (!interaction.guild || !interaction.guildId) {
    await interaction.reply({ content: "Run /onboard in a server.", ephemeral: true });
    return;
  }
  if (!isAdmin(interaction)) {
    await interaction.reply({ content: "Only an admin can onboard.", ephemeral: true });
    return;
  }

  const id = key(interaction.guildId, interaction.user.id);
  const state = pending.get(id) ?? { create: [], fill: [] };

  if (interaction.isStringSelectMenu() && interaction.customId === CREATE_ID) {
    const create = asFamilies(interaction.values);
    pending.set(id, { create, fill: [...create] });
    await interaction.update({
      content: fillStepContent(create),
      components: create.length > 0 ? [fillMenu(create), fillButtons()] : [fillButtons()],
    });
    return;
  }

  if (interaction.isStringSelectMenu() && interaction.customId === FILL_ID) {
    const fill = asFamilies(interaction.values);
    pending.set(id, { create: state.create, fill });
    await interaction.update({
      content: fillStepContent(fill),
      components: [fillMenu(state.create), fillButtons()],
    });
    return;
  }

  if (!interaction.isButton()) return;

  const create = state.create;
  const fill = interaction.customId === EMPTY_ID ? [] : state.fill;
  pending.delete(id);
  await interaction.deferUpdate();

  try {
    const { overviewId } = await applyOnboardChoices(interaction.guild, interaction.client, create, fill);
    const filled = fill.length > 0 ? " Filling those channels from oldest to newest." : "";
    await interaction.editReply({
      content: `Overview posted in <#${overviewId}>. React there for pings. Listings go in the family channels, not there.${filled}`,
      components: [],
    });
  } catch (err) {
    await interaction.editReply({
      content: `Onboard failed: ${(err as Error).message}`,
      components: [],
    });
  }
}
