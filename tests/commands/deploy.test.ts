import { describe, it, expect, vi, beforeEach } from "vitest";

const put = vi.hoisted(() => vi.fn().mockResolvedValue([]));

vi.mock("discord.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("discord.js")>();
  return {
    ...actual,
    REST: class {
      setToken() {
        return this;
      }
      put = put;
    },
  };
});

import { deployCommands } from "@/commands/deploy";
import { Routes } from "discord.js";

describe("deployCommands", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    put.mockResolvedValue([]);
    process.env.DISCORD_TOKEN = "test-token";
  });

  it("publishes global commands and clears per-server copies", async () => {
    const client = {
      user: { id: "bot_1" },
      guilds: {
        cache: {
          values: () =>
            [{ id: "guild_a", name: "Alpha" }, { id: "guild_b", name: "Beta" }][Symbol.iterator](),
        },
      },
    } as any;

    await deployCommands(client);

    expect(put).toHaveBeenCalledWith(Routes.applicationCommands("bot_1"), {
      body: expect.any(Array),
    });
    expect(put).toHaveBeenCalledWith(Routes.applicationGuildCommands("bot_1", "guild_a"), {
      body: [],
    });
    expect(put).toHaveBeenCalledWith(Routes.applicationGuildCommands("bot_1", "guild_b"), {
      body: [],
    });
  });

  it("on join clears that server instead of registering a second command set", async () => {
    const client = {
      user: { id: "bot_1" },
      guilds: { cache: { values: () => [][Symbol.iterator]() } },
    } as any;
    const guild = { id: "guild_new", name: "New" } as any;

    await deployCommands(client, guild);

    expect(put).toHaveBeenCalledWith(Routes.applicationCommands("bot_1"), {
      body: expect.any(Array),
    });
    expect(put).toHaveBeenCalledWith(Routes.applicationGuildCommands("bot_1", "guild_new"), {
      body: [],
    });
  });
});
