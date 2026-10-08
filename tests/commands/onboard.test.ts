import { describe, it, expect, vi, beforeEach } from "vitest";

const mockEnsureGuildSetup = vi.hoisted(() => vi.fn());
const mockOnboardUpsert = vi.hoisted(() => vi.fn());
const mockOnboardFindUnique = vi.hoisted(() => vi.fn());

vi.mock("@/provisioner/index", () => ({
  ensureGuildSetup: mockEnsureGuildSetup,
}));

vi.mock("@/poster/seed", () => ({
  seedRecentPostingsForGuild: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/db/client", () => ({
  prisma: {
    onboardPanel: {
      upsert: mockOnboardUpsert,
      findUnique: mockOnboardFindUnique,
    },
    channelMap: { deleteMany: vi.fn() },
    guildState: {
      findUnique: vi.fn(async () => null),
      create: vi.fn(async () => ({})),
    },
  },
}));

import { buildOnboardEmbed, applyOnboardChoices, handleOnboard } from "@/commands/onboard";
import { createStepContent, fillStepContent } from "@/commands/onboard-picker";
import { familyForEmoji, handleOnboardReaction } from "@/commands/onboard-reactions";

describe("onboard embed", () => {
  it("describes sources and reaction families", () => {
    const embed = buildOnboardEmbed().toJSON();
    expect(embed.title).toMatch(/intern/i);
    expect(embed.description).toMatch(/react/i);
    expect(embed.description).toMatch(/#job-board/);
    const fields = embed.fields ?? [];
    expect(fields.some((f) => /scrapes/i.test(f.name) && /Greenhouse career boards/.test(f.value))).toBe(true);
    expect(fields.find((f) => /scrapes/i.test(f.name))?.value).not.toContain("(SpaceX");
    const github = fields.find((f) => /github/i.test(f.name));
    expect(github?.value).toContain("https://github.com/EmanuelNader/Engineering-Internship-Job-Board-Bot");
    expect(github?.value).toMatch(/star/i);
    const pings = fields.find((f) => /pings/i.test(f.name));
    expect(pings?.value).toContain("💻");
    expect(pings?.value).toContain("#civil-structural-jobs");
    expect(pings?.value).toContain("#mechanical-jobs");
    expect(pings?.value).toContain("#other-jobs");
    expect(pings?.value).toContain("Other (Design + Growth)");
    expect(pings?.value).not.toContain("#engineering-jobs");
    expect(pings?.value).not.toContain("#design-jobs");
    expect(pings?.value).not.toContain("#growth-jobs");
  });
});

describe("onboard picker copy", () => {
  it("asks which channels to create and how far fill goes", () => {
    expect(createStepContent()).toContain("#job-board");
    expect(createStepContent()).toContain("UX, product design");
    expect(createStepContent()).not.toContain("Theta Tau");
    expect(fillStepContent(["mechanical"])).toContain("last 7 days");
    expect(fillStepContent(["mechanical"])).toContain("oldest first");
    expect(fillStepContent(["mechanical"])).toContain("#mechanical-jobs");
    expect(fillStepContent(["mechanical"])).not.toContain("September");
  });
});

describe("handleOnboard", () => {
  beforeEach(() => vi.clearAllMocks());

  it("asks which channels to create before making any", async () => {
    const reply = vi.fn();
    const interaction = {
      reply,
      guildId: "guild_1",
      guild: { id: "guild_1" },
      user: { id: "admin_1" },
      memberPermissions: { has: () => true },
    } as any;

    await handleOnboard(interaction);

    expect(mockEnsureGuildSetup).not.toHaveBeenCalled();
    expect(reply).toHaveBeenCalledWith(expect.objectContaining({
      ephemeral: true,
      content: expect.stringContaining("Which channels should I create?"),
    }));
  });
});

describe("applyOnboardChoices", () => {
  beforeEach(() => vi.clearAllMocks());

  it("creates the picked channels then posts a reaction panel", async () => {
    const react = vi.fn();
    const overviewSend = vi.fn().mockResolvedValue({ id: "msg_1", react });
    mockEnsureGuildSetup.mockResolvedValue({ id: "overview_1", send: overviewSend });
    mockOnboardFindUnique.mockResolvedValue(null);
    const guild = { id: "guild_1", channels: { fetch: vi.fn() } } as any;

    await applyOnboardChoices(guild, {} as any, ["mechanical", "swe"], ["mechanical"]);

    expect(mockEnsureGuildSetup).toHaveBeenCalledWith(guild, ["mechanical", "swe"]);
    expect(overviewSend).toHaveBeenCalled();
    expect(react).toHaveBeenCalled();
    expect(mockOnboardUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { guildId: "guild_1" },
        create: expect.objectContaining({ messageId: "msg_1", channelId: "overview_1" }),
      })
    );
  });

  it("deletes a leftover panel in #general before posting in #job-board", async () => {
    const react = vi.fn();
    const overviewSend = vi.fn().mockResolvedValue({ id: "msg_2", react });
    mockEnsureGuildSetup.mockResolvedValue({ id: "overview_1", send: overviewSend });
    const deleteOld = vi.fn();
    mockOnboardFindUnique.mockResolvedValue({
      guildId: "guild_1",
      channelId: "general_1",
      messageId: "old_msg",
    });
    const guild = {
      id: "guild_1",
      channels: {
        fetch: vi.fn().mockResolvedValue({
          isTextBased: () => true,
          messages: {
            fetch: vi.fn().mockResolvedValue({ delete: deleteOld }),
          },
        }),
      },
    } as any;

    await applyOnboardChoices(guild, {} as any, ["swe"], []);

    expect(deleteOld).toHaveBeenCalled();
    expect(overviewSend).toHaveBeenCalled();
  });
});

describe("handleOnboardReaction", () => {
  beforeEach(() => vi.clearAllMocks());

  it("maps family emojis", () => {
    expect(familyForEmoji("💻")?.family).toBe("swe");
    expect(familyForEmoji("🌉")?.family).toBe("civil-structural");
    expect(familyForEmoji("⚙️")?.family).toBe("mechanical");
    expect(familyForEmoji("⚡")?.family).toBe("electrical");
    expect(familyForEmoji("🧪")?.family).toBe("chemical");
    expect(familyForEmoji("🚀")?.family).toBe("aerospace");
    expect(familyForEmoji("📦")?.family).toBe("other");
    expect(familyForEmoji("nope")).toBeUndefined();
  });

  it("assigns the family ping role on react", async () => {
    mockOnboardFindUnique.mockResolvedValue({ messageId: "msg_1" });
    const add = vi.fn();
    const swe = { name: "SWE" };
    const reaction = {
      partial: false,
      emoji: { name: "💻" },
      message: {
        id: "msg_1",
        guild: {
          members: { fetch: vi.fn().mockResolvedValue({ roles: { add, remove: vi.fn() } }) },
          roles: {
            cache: { find: (fn: (r: { name: string }) => boolean) => [swe].find(fn) },
            fetch: vi.fn().mockResolvedValue(undefined),
          },
        },
      },
    } as any;

    await handleOnboardReaction(reaction, { bot: false, id: "user_1" } as any, true);
    expect(add).toHaveBeenCalledWith(swe);
  });

  it("ignores reactions on other messages", async () => {
    mockOnboardFindUnique.mockResolvedValue(null);
    const add = vi.fn();
    const reaction = {
      partial: false,
      emoji: { name: "💻" },
      message: { id: "other", guild: { members: { fetch: vi.fn() } } },
    } as any;
    await handleOnboardReaction(reaction, { bot: false, id: "user_1" } as any, true);
    expect(add).not.toHaveBeenCalled();
  });
});
