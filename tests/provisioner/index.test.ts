import { describe, it, expect, vi, beforeEach } from "vitest";

const mockChannelCreate = vi.hoisted(() => vi.fn());
const mockRoleCreate = vi.hoisted(() => vi.fn());
const mockChannelsFetch = vi.hoisted(() => vi.fn());
const mockRolesFetch = vi.hoisted(() => vi.fn());
const mockChannelMapUpsert = vi.hoisted(() => vi.fn());

vi.mock("@/db/client", () => ({
  prisma: {
    channelMap: { upsert: mockChannelMapUpsert },
  },
}));

import { ensureGuildSetup } from "@/provisioner/index";

describe("ensureGuildSetup", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockChannelsFetch.mockResolvedValue([]);
    mockRolesFetch.mockResolvedValue([]);
  });

  it("creates missing channels and roles", async () => {
    const mockGuild = {
      id: "guild_1",
      channels: { fetch: mockChannelsFetch, create: mockChannelCreate },
      roles: { fetch: mockRolesFetch, create: mockRoleCreate },
    };

    mockChannelCreate.mockImplementation(async (opts: { name: string }) => ({
      id: `chan_${opts.name}`,
      name: opts.name,
      isTextBased: () => true,
      isDMBased: () => false,
    }));
    mockRoleCreate.mockResolvedValue({ id: "role_1" });

    await ensureGuildSetup(mockGuild as any);

    // Should create family ping roles (SWE, PM, ...) not per-title roles
    expect(mockRoleCreate).toHaveBeenCalled();
    expect(mockRoleCreate).toHaveBeenCalledWith(expect.objectContaining({ name: "SWE" }));
    expect(mockRoleCreate).toHaveBeenCalledWith(expect.objectContaining({ name: "Civil/Structural" }));
    expect(mockRoleCreate).toHaveBeenCalledWith(expect.objectContaining({ name: "Mechanical" }));
    expect(mockRoleCreate).not.toHaveBeenCalledWith(expect.objectContaining({ name: "Engineering" }));
    expect(mockRoleCreate).not.toHaveBeenCalledWith(expect.objectContaining({ name: "SWE - Frontend" }));
    expect(mockChannelCreate).toHaveBeenCalledWith(expect.objectContaining({ name: "civil-structural-jobs" }));
    expect(mockChannelCreate).toHaveBeenCalledWith(expect.objectContaining({ name: "other-jobs" }));
    expect(mockChannelCreate).toHaveBeenCalledWith(
      expect.objectContaining({ name: "job-board", position: 0 })
    );
    expect(mockChannelCreate).not.toHaveBeenCalledWith(expect.objectContaining({ name: "engineering-jobs" }));
    expect(mockChannelCreate).not.toHaveBeenCalledWith(expect.objectContaining({ name: "design-jobs" }));
    expect(mockChannelCreate).not.toHaveBeenCalledWith(expect.objectContaining({ name: "growth-jobs" }));
  });

  it("skips existing channels and roles", async () => {
    const mockGuild = {
      id: "guild_1",
      channels: {
        fetch: vi.fn().mockResolvedValue([
          { name: "job-board", id: "overview_chan", isTextBased: () => true, isDMBased: () => false },
          { name: "swe-jobs", id: "existing_chan" },
        ]),
        create: mockChannelCreate,
      },
      roles: {
        fetch: vi.fn().mockResolvedValue([
          { name: "SWE", id: "existing_role" },
        ]),
        create: mockRoleCreate,
      },
    };

    await ensureGuildSetup(mockGuild as any);

    // Should NOT create existing channel or role
    expect(mockChannelCreate).not.toHaveBeenCalledWith(expect.objectContaining({ name: "swe-jobs" }));
    expect(mockChannelCreate).not.toHaveBeenCalledWith(expect.objectContaining({ name: "job-board" }));
    expect(mockRoleCreate).not.toHaveBeenCalledWith(expect.objectContaining({ name: "SWE" }));
  });

  it("creates only the channels an admin picked", async () => {
    const mockGuild = {
      id: "guild_1",
      channels: { fetch: mockChannelsFetch, create: mockChannelCreate },
      roles: { fetch: mockRolesFetch, create: mockRoleCreate },
    };
    mockChannelCreate.mockImplementation(async (opts: { name: string }) => ({
      id: `chan_${opts.name}`,
      name: opts.name,
      isTextBased: () => true,
      isDMBased: () => false,
    }));

    await ensureGuildSetup(mockGuild as any, ["mechanical"]);

    expect(mockChannelCreate).toHaveBeenCalledWith(expect.objectContaining({ name: "job-board" }));
    expect(mockChannelCreate).toHaveBeenCalledWith(expect.objectContaining({ name: "mechanical-jobs" }));
    expect(mockChannelCreate).not.toHaveBeenCalledWith(expect.objectContaining({ name: "swe-jobs" }));
    expect(mockChannelMapUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { guildId_kind_roleFamily: { guildId: "guild_1", kind: "job", roleFamily: "mechanical" } },
      })
    );
  });
});
