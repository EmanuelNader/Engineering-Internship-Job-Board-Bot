import { describe, it, expect, vi, beforeEach } from "vitest";

const mockFindManyMap = vi.hoisted(() => vi.fn());
const mockFindManyPosting = vi.hoisted(() => vi.fn());
const mockPostingUpdate = vi.hoisted(() => vi.fn());
const mockDeliveries = vi.hoisted(() => vi.fn(async () => [] as { dedupHash: string; channelId: string }[]));

vi.mock("@/db/client", () => ({
  prisma: {
    channelMap: { findMany: mockFindManyMap },
    posting: { findMany: mockFindManyPosting, update: mockPostingUpdate },
    postingDelivery: { findMany: mockDeliveries },
  },
}));

import { seedRecentPostings } from "@/poster/seed";

describe("seedRecentPostings", () => {
  const send = vi.fn().mockResolvedValue(undefined);

  beforeEach(() => {
    vi.clearAllMocks();
    send.mockResolvedValue(undefined);
    mockDeliveries.mockResolvedValue([]);
  });

  it("sends in-window jobs that were never delivered to this server", async () => {
    mockFindManyMap.mockResolvedValue([
      { kind: "job", roleFamily: "chemical", channelId: "theta_chem", guildId: "guild_1" },
    ]);
    mockFindManyPosting.mockResolvedValue([
      {
        dedupHash: "h1",
        title: "Chemical Engineering Intern",
        company: "Motiva",
        location: "Port Arthur, TX",
        url: "https://a.com",
        level: "internship",
        sourceName: "workday",
        roleFamily: JSON.stringify(["chemical"]),
        roleTitles: JSON.stringify(["eng-chemical"]),
        publishedAt: new Date("2026-09-20"),
        firstSeenAt: new Date("2026-09-20"),
        channelIds: JSON.stringify(["old_ay_channel"]),
        raw: null,
      },
    ]);

    const result = await seedRecentPostings(send, new Date("2026-09-14"), {
      guildId: "guild_1",
      families: ["chemical"],
    });

    expect(result).toEqual({ sent: 1, skipped: 0 });
    expect(send).toHaveBeenCalledWith(
      expect.objectContaining({ title: "Chemical Engineering Intern", company: "Motiva" }),
      "h1"
    );
  });

  it("skips jobs already delivered to this server's channel", async () => {
    mockFindManyMap.mockResolvedValue([
      { kind: "job", roleFamily: "chemical", channelId: "theta_chem", guildId: "guild_1" },
    ]);
    mockDeliveries.mockResolvedValue([{ dedupHash: "h1", channelId: "theta_chem" }]);
    mockFindManyPosting.mockResolvedValue([
      {
        dedupHash: "h1",
        title: "Chemical Engineering Intern",
        company: "Acme",
        location: "SF",
        url: "https://a.com",
        level: "internship",
        sourceName: "workday",
        roleFamily: JSON.stringify(["chemical"]),
        roleTitles: JSON.stringify(["eng-chemical"]),
        publishedAt: new Date("2026-09-18"),
        firstSeenAt: new Date("2026-09-18"),
        channelIds: null,
        raw: null,
      },
    ]);

    const result = await seedRecentPostings(send, new Date("2026-09-14"), {
      guildId: "guild_1",
      families: ["chemical"],
    });

    expect(result).toEqual({ sent: 0, skipped: 1 });
    expect(send).not.toHaveBeenCalled();
  });

  it("sends undated Workday internships that never reached Discord", async () => {
    mockFindManyMap.mockResolvedValue([
      { kind: "job", roleFamily: "aerospace", channelId: "theta_aero", guildId: "guild_1" },
    ]);
    mockFindManyPosting.mockResolvedValue([
      {
        dedupHash: "wd1",
        title: "Systems Engineering Intern - Mechanical/Aerospace Engineering",
        company: "GE Aerospace",
        location: "Dayton, OH",
        url: "https://workday.example/job",
        level: "internship",
        sourceName: "workday",
        roleFamily: JSON.stringify(["aerospace"]),
        roleTitles: JSON.stringify(["eng-aerospace"]),
        publishedAt: null,
        firstSeenAt: new Date("2026-09-21"),
        channelIds: null,
        raw: null,
      },
    ]);

    const result = await seedRecentPostings(send, new Date("2026-09-14"), {
      guildId: "guild_1",
      families: ["aerospace"],
    });

    expect(result).toEqual({ sent: 1, skipped: 0 });
    expect(send).toHaveBeenCalledWith(
      expect.objectContaining({
        title: "Systems Engineering Intern - Mechanical/Aerospace Engineering",
        company: "GE Aerospace",
      }),
      "wd1"
    );
  });

  it("skips families that were not selected and non-US listings", async () => {
    mockFindManyMap.mockResolvedValue([
      { kind: "job", roleFamily: "aerospace", channelId: "theta_aero", guildId: "guild_1" },
      { kind: "job", roleFamily: "electrical", channelId: "theta_ee", guildId: "guild_1" },
    ]);
    mockFindManyPosting.mockResolvedValue([
      {
        dedupHash: "ee",
        title: "Electrical Engineer Intern",
        company: "RTX",
        location: "Tucson, AZ",
        url: "https://a.com/ee",
        level: "internship",
        sourceName: "workday",
        roleFamily: JSON.stringify(["electrical"]),
        roleTitles: JSON.stringify(["eng-electrical"]),
        publishedAt: new Date("2026-09-18"),
        firstSeenAt: new Date("2026-09-21"),
        channelIds: null,
        raw: null,
      },
      {
        dedupHash: "ca",
        title: "Internship - Winter 2027 - Aerospace Manufacturing",
        company: "RTX",
        location: "CA-NS-HALIFAX-PLANT 41 ~ 189 Pratt & Whitney Dr ~ PLANT 41",
        url: "https://a.com/ca",
        level: "internship",
        sourceName: "workday",
        roleFamily: JSON.stringify(["aerospace"]),
        roleTitles: JSON.stringify(["eng-aerospace"]),
        publishedAt: new Date("2026-09-20"),
        firstSeenAt: new Date("2026-09-21"),
        channelIds: null,
        raw: null,
      },
    ]);

    const result = await seedRecentPostings(send, new Date("2026-09-14"), {
      guildId: "guild_1",
      families: ["aerospace"],
    });

    expect(result).toEqual({ sent: 0, skipped: 2 });
    expect(send).not.toHaveBeenCalled();
  });

  it("posts oldest first and skips roles before the server window", async () => {
    mockFindManyMap.mockResolvedValue([
      { kind: "job", roleFamily: "civil-structural", channelId: "theta_civil", guildId: "guild_1" },
    ]);
    mockPostingUpdate.mockResolvedValue({});
    mockFindManyPosting.mockResolvedValue([
      {
        dedupHash: "new",
        title: "Structural Engineering Co-op (Summer/Fall 2027)",
        company: "RTX",
        location: "US",
        url: "https://a.com/new",
        level: "co-op",
        sourceName: "workday",
        roleFamily: JSON.stringify(["civil-structural"]),
        roleTitles: JSON.stringify(["eng-structural"]),
        publishedAt: new Date("2026-09-21T00:00:00Z"),
        firstSeenAt: new Date("2026-09-21T20:00:00Z"),
        channelIds: null,
        raw: null,
      },
      {
        dedupHash: "old",
        title: "Summer 2027 Civil Engineering Internship",
        company: "SpaceX",
        location: "US",
        url: "https://a.com/old",
        level: "internship",
        sourceName: "greenhouse",
        roleFamily: JSON.stringify(["engineering"]),
        roleTitles: JSON.stringify(["eng-civil"]),
        publishedAt: new Date("2026-09-15T17:42:56Z"),
        firstSeenAt: new Date("2026-09-21T03:55:00Z"),
        channelIds: null,
        raw: null,
      },
      {
        dedupHash: "ancient",
        title: "Civil Engineering Intern",
        company: "Old Co",
        location: "Austin, TX",
        url: "https://a.com/ancient",
        level: "internship",
        sourceName: "greenhouse",
        roleFamily: JSON.stringify(["civil-structural"]),
        roleTitles: JSON.stringify(["eng-civil"]),
        publishedAt: new Date("2026-08-03T17:42:56Z"),
        firstSeenAt: new Date("2026-08-03T17:42:56Z"),
        channelIds: null,
        raw: null,
      },
    ]);

    const result = await seedRecentPostings(send, new Date("2026-09-14"), {
      guildId: "guild_1",
      families: ["civil-structural"],
    });

    expect(result.sent).toBe(2);
    expect(send.mock.calls.map((call) => call[1])).toEqual(["old", "new"]);
    expect(send.mock.calls[0][0].roleFamily).toEqual(["civil-structural"]);
    expect(mockPostingUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { dedupHash: "old" },
        data: expect.objectContaining({
          roleFamily: JSON.stringify(["civil-structural"]),
        }),
      })
    );
  });

  it("fills only the selected family when a title matches two", async () => {
    mockFindManyMap.mockResolvedValue([
      { kind: "job", roleFamily: "chemical", channelId: "chem", guildId: "guild_1" },
      { kind: "job", roleFamily: "mechanical", channelId: "mech", guildId: "guild_1" },
    ]);
    mockFindManyPosting.mockResolvedValue([
      {
        dedupHash: "both",
        title: "Manufacturing Engineer Intern",
        company: "Dow",
        location: "Houston, TX",
        url: "https://a.com/both",
        level: "internship",
        sourceName: "workday",
        roleFamily: JSON.stringify(["chemical", "mechanical"]),
        roleTitles: JSON.stringify(["eng-chemical", "eng-mechanical"]),
        publishedAt: new Date("2026-09-20"),
        firstSeenAt: new Date("2026-09-20"),
        channelIds: null,
        raw: null,
      },
    ]);

    await seedRecentPostings(send, new Date("2026-09-14"), {
      guildId: "guild_1",
      families: ["chemical"],
    });

    expect(send).toHaveBeenCalledOnce();
    expect(send.mock.calls[0][0].roleFamily).toEqual(["chemical"]);
  });
});
