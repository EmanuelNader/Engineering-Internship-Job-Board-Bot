import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const mockChannelSend = vi.hoisted(() => vi.fn());
const mockFindMany = vi.hoisted(() => vi.fn());
const mockUpdate = vi.hoisted(() => vi.fn());
const mockUpdateMany = vi.hoisted(() => vi.fn(async () => ({ count: 1 })));
const mockClientChannelsFetch = vi.hoisted(() => vi.fn());
const mockClaimFind = vi.hoisted(() => vi.fn(async () => null));
const mockClaimCreate = vi.hoisted(() => vi.fn(async () => ({ titleKey: "k" })));
const mockPostingFind = vi.hoisted(() => vi.fn(async () => ({ postedAt: null, titleKey: null })));
const mockGuildStates = vi.hoisted(() => vi.fn(async () => [{ guildId: "g1", liveSince: new Date("2020-01-01") }]));
const mockDeliveries = vi.hoisted(() => vi.fn(async () => []));
const mockDeliveryCreate = vi.hoisted(() => vi.fn(async () => ({})));

vi.mock("@/db/client", () => ({
  prisma: {
    channelMap: { findMany: mockFindMany },
    guildState: { findMany: mockGuildStates },
    postingDelivery: { findMany: mockDeliveries, create: mockDeliveryCreate },
    posting: {
      update: mockUpdate,
      updateMany: mockUpdateMany,
      findUnique: mockPostingFind,
    },
    postingClaim: {
      findUnique: mockClaimFind,
      create: mockClaimCreate,
      delete: vi.fn(),
    },
    $transaction: async (fn: (tx: unknown) => Promise<unknown>) =>
      fn({
        postingClaim: { findUnique: mockClaimFind, create: mockClaimCreate },
        posting: {
          findUnique: mockPostingFind,
          update: mockUpdate,
          updateMany: mockUpdateMany,
        },
      }),
  },
}));

vi.mock("@/poster/embed", () => ({
  buildPostingEmbed: vi.fn(() => ({ toJSON: () => ({ title: "Mock" }) })),
}));

import { Poster } from "@/poster/index";

const samplePosting = {
  title: "SWE Intern",
  company: "Acme",
  url: "https://a.com",
  level: "internship",
  sourceName: "greenhouse",
  location: "SF",
  roleFamily: ["swe"],
  roleTitles: ["swe-frontend"],
};

describe("Poster", () => {
  let poster: Poster;
  let mockClient: any;

  beforeEach(() => {
    vi.clearAllMocks();
    mockClientChannelsFetch.mockReset();
    mockClaimFind.mockResolvedValue(null);
    mockPostingFind.mockResolvedValue({ postedAt: null, titleKey: null });
    mockGuildStates.mockResolvedValue([{ guildId: "g1", liveSince: new Date("2020-01-01") }]);
    mockDeliveries.mockResolvedValue([]);

    mockClient = {
      channels: { fetch: mockClientChannelsFetch },
      guilds: {
        cache: {
          first: () => ({
            roles: { cache: [] },
          }),
        },
      },
    };

    poster = new Poster(mockClient);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("looks up channel map and sends embed", async () => {
    mockFindMany.mockResolvedValue([
      { kind: "job", roleFamily: "swe", channelId: "111", guildId: "g1" },
    ]);
    mockClientChannelsFetch.mockResolvedValue({
      send: mockChannelSend.mockResolvedValue({ id: "msg1" }),
      isTextBased: () => true,
    });

    await poster.send(samplePosting, "hash123");

    expect(mockFindMany).toHaveBeenCalledWith({
      where: { kind: "job", roleFamily: { in: ["swe"] }, guildId: { not: "" } },
    });
    expect(mockClientChannelsFetch).toHaveBeenCalledWith("111");
    expect(mockChannelSend).toHaveBeenCalledOnce();
    expect(mockUpdate).toHaveBeenCalledWith({
      where: { dedupHash: "hash123" },
      data: expect.objectContaining({
        postedAt: expect.any(Date),
        channelIds: expect.any(String),
      }),
    });
  });

  it("skips when no channel map entry found", async () => {
    mockFindMany.mockResolvedValue([]);

    await poster.send(
      {
        title: "Intern",
        company: "Acme",
        url: "https://a.com",
        level: "internship",
        sourceName: "gh",
        location: null,
        roleFamily: ["swe"],
        roleTitles: [],
      },
      "hash123"
    );

    expect(mockClientChannelsFetch).not.toHaveBeenCalled();
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it("spaces Discord sends by intervalMs", async () => {
    vi.useFakeTimers();
    const intervalMs = 2000;
    poster = new Poster(mockClient, undefined, intervalMs);

    mockFindMany.mockResolvedValue([
      { kind: "job", roleFamily: "swe", channelId: "111", guildId: "g1" },
    ]);
    mockClientChannelsFetch.mockResolvedValue({
      send: mockChannelSend.mockResolvedValue({ id: "msg1" }),
      isTextBased: () => true,
    });

    const p1 = poster.send({ ...samplePosting, title: "A" }, "hashA");
    const p2 = poster.send({ ...samplePosting, title: "B" }, "hashB");

    await vi.advanceTimersByTimeAsync(0);
    expect(mockChannelSend).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(intervalMs - 1);
    expect(mockChannelSend).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(1);
    expect(mockChannelSend).toHaveBeenCalledTimes(2);

    await Promise.all([p1, p2]);
  });

  it("does not post jobs whose only family is disabled or unknown", async () => {
    await poster.send(
      { ...samplePosting, roleFamily: ["engineering"] },
      "hash-disabled"
    );

    expect(mockFindMany).not.toHaveBeenCalled();
    expect(mockClientChannelsFetch).not.toHaveBeenCalled();
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it("posts only enabled families when a listing also matches a disabled one", async () => {
    mockFindMany.mockResolvedValue([
      { kind: "job", roleFamily: "swe", channelId: "111", guildId: "g1" },
    ]);
    mockClientChannelsFetch.mockResolvedValue({
      send: mockChannelSend.mockResolvedValue({ id: "msg1" }),
      isTextBased: () => true,
    });

    await poster.send(
      { ...samplePosting, roleFamily: ["swe", "engineering"] },
      "hash-mixed"
    );

    expect(mockFindMany).toHaveBeenCalledWith({
      where: { kind: "job", roleFamily: { in: ["swe"] }, guildId: { not: "" } },
    });
    expect(mockChannelSend).toHaveBeenCalledOnce();
  });

  it("does not send when this company and title were already claimed", async () => {
    mockFindMany.mockResolvedValue([
      { kind: "job", roleFamily: "swe", channelId: "111", guildId: "g1" },
    ]);
    mockClaimFind.mockResolvedValue({ titleKey: "k", guildId: "g1", dedupHash: "other" });

    await poster.send(samplePosting, "hash-dup");

    expect(mockClientChannelsFetch).not.toHaveBeenCalled();
    expect(mockChannelSend).not.toHaveBeenCalled();
  });
});
