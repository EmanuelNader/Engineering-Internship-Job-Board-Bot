import { describe, it, expect, vi, beforeEach } from "vitest";

const mockDetectLevel = vi.hoisted(() => vi.fn());
const mockDetectRoleFamily = vi.hoisted(() => vi.fn());
const mockDetectRoleTitles = vi.hoisted(() => vi.fn());
const mockDedupHash = vi.hoisted(() => vi.fn());
const mockContentHash = vi.hoisted(() => vi.fn(() => "content-hash-123"));
const mockIsUsLocation = vi.hoisted(() => vi.fn(() => true));
const mockResolveAtsPublishedAt = vi.hoisted(() => vi.fn(async () => null));

vi.mock("@/db/client", () => ({
  prisma: {
    posting: {
      upsert: vi.fn(),
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      update: vi.fn(),
    },
    source: {
      upsert: vi.fn(),
    },
  },
}));

vi.mock("@/lib/normalize", () => ({
  detectLevel: mockDetectLevel,
  detectRoleFamily: mockDetectRoleFamily,
  detectRoleTitles: mockDetectRoleTitles,
  dedupHash: mockDedupHash,
  contentHash: mockContentHash,
  titleCompanyHash: () => "title-key",
  isUsLocation: mockIsUsLocation,
  atsUrlNeedle: () => null,
  greenhouseJobId: () => null,
  atsLookupNeedles: () => [],
}));

vi.mock("@/lib/ats-published-at", () => ({
  resolveAtsPublishedAt: mockResolveAtsPublishedAt,
}));

import { SourcesManager } from "@/scheduler/index";
import type { SourceAdapter } from "@/lib/types";

const { prisma } = await import("@/db/client");

describe("SourcesManager", () => {
  let mockAdapter: SourceAdapter;
  let onNewPosting: ReturnType<typeof vi.fn>;
  let onError: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockResolveAtsPublishedAt.mockResolvedValue(null);

    mockAdapter = {
      name: "test",
      pollIntervalSec: 300,
      fetchNewPostings: vi.fn().mockResolvedValue([]),
    };

    onNewPosting = vi.fn();
    onError = vi.fn();
  });

  it("fetches postings from adapter", async () => {
    const manager = new SourcesManager([mockAdapter], onNewPosting, onError);
    await manager.runOnce("test");

    expect(mockAdapter.fetchNewPostings).toHaveBeenCalledOnce();
  });

  it("calls detectLevel and drops non-intern postings", async () => {
    mockAdapter.fetchNewPostings = vi.fn().mockResolvedValue([
      { title: "Senior Engineer", company: "Acme", url: "https://a.com/1", raw: {} },
    ]);
    mockDetectLevel.mockReturnValue(null);

    const manager = new SourcesManager([mockAdapter], onNewPosting, onError);
    await manager.runOnce("test");

    expect(mockDetectLevel).toHaveBeenCalled();
    expect(onNewPosting).not.toHaveBeenCalled();
    expect(prisma.source.upsert).toHaveBeenCalled();
    const call = (prisma.source.upsert as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(call.create.droppedNonIntern).toBe(1);
  });

  it("drops postings with unclassifiable role family", async () => {
    mockAdapter.fetchNewPostings = vi.fn().mockResolvedValue([
      { title: "Intern", company: "Acme", url: "https://a.com/1", raw: {} },
    ]);
    mockDetectLevel.mockReturnValue("internship");
    mockDetectRoleFamily.mockReturnValue([]);

    const manager = new SourcesManager([mockAdapter], onNewPosting, onError);
    await manager.runOnce("test");

    expect(mockDetectRoleFamily).toHaveBeenCalled();
    expect(onNewPosting).not.toHaveBeenCalled();
    const call = (prisma.source.upsert as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(call.create.droppedUnclassified).toBe(1);
  });

  it("upserts new posting and calls onNewPosting", async () => {
    mockAdapter.fetchNewPostings = vi.fn().mockResolvedValue([
      {
        title: "Software Engineer Intern",
        company: "Acme",
        location: "SF",
        url: "https://a.com/1",
        externalId: "ext1",
        publishedAt: "2026-06-15T10:00:00Z",
        raw: {},
      },
    ]);
    mockDetectLevel.mockReturnValue("internship");
    mockDetectRoleFamily.mockReturnValue(["swe"]);
    mockDetectRoleTitles.mockReturnValue(["swe-frontend"]);
    mockDedupHash.mockReturnValue("hash123");
    mockContentHash.mockReturnValue("content-hash-123");
    (prisma.posting.findUnique as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce(null) // contentHash check - no existing
      .mockResolvedValueOnce({ id: 1, dedupHash: "hash123", postedAt: null, publishedAt: new Date("2026-06-15T10:00:00Z"), firstSeenAt: new Date() }); // after upsert
    (prisma.posting.upsert as ReturnType<typeof vi.fn>).mockResolvedValue({ id: 1 });

    const manager = new SourcesManager(
      [mockAdapter],
      onNewPosting,
      onError,
      new Date("2026-01-01T00:00:00Z")
    );
    await manager.runOnce("test");

    expect(prisma.posting.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { dedupHash: "hash123" },
        create: expect.objectContaining({
          company: "Acme",
          level: "internship",
        }),
      })
    );
    expect(onNewPosting).toHaveBeenCalledWith(
      expect.objectContaining({
        title: "Software Engineer Intern",
        company: "Acme",
        sourceName: "test",
        roleFamily: ["swe"],
        roleTitles: ["swe-frontend"],
        level: "internship",
        postedAt: new Date("2026-06-15T10:00:00Z"),
      }),
      "hash123"
    );
  });

  it("does not Discord-post jobs published before the onboard day", async () => {
    mockAdapter.fetchNewPostings = vi.fn().mockResolvedValue([
      {
        title: "Electrical Engineer Intern",
        company: "Neuralink",
        url: "https://a.com/1",
        externalId: "ext1",
        publishedAt: "2026-04-16T00:00:00Z",
        raw: {},
      },
    ]);
    mockDetectLevel.mockReturnValue("internship");
    mockDetectRoleFamily.mockReturnValue(["electrical"]);
    mockDetectRoleTitles.mockReturnValue(["eng-electrical"]);
    mockDedupHash.mockReturnValue("hash123");
    mockContentHash.mockReturnValue("content-hash-123");
    (prisma.posting.findUnique as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({
        id: 1,
        dedupHash: "hash123",
        postedAt: new Date(),
        publishedAt: new Date("2026-04-16T00:00:00Z"),
        firstSeenAt: new Date(),
      });
    (prisma.posting.upsert as ReturnType<typeof vi.fn>).mockResolvedValue({ id: 1 });

    const manager = new SourcesManager(
      [mockAdapter],
      onNewPosting,
      onError,
      new Date("2026-09-02T18:00:00Z")
    );
    await manager.runOnce("test");

    expect(onNewPosting).not.toHaveBeenCalled();
    expect(prisma.posting.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          postedAt: expect.any(Date),
        }),
      })
    );
  });

  it("Discord-posts Workday internships that have no published date", async () => {
    mockAdapter.name = "workday";
    mockAdapter.fetchNewPostings = vi.fn().mockResolvedValue([
      {
        title: "Mechanical Engineering Intern (Summer 2027)",
        company: "RTX",
        url: "https://globalhr.wd5.myworkdayjobs.com/job/1",
        externalId: "R123",
        raw: {},
      },
    ]);
    mockDetectLevel.mockReturnValue("internship");
    mockDetectRoleFamily.mockReturnValue(["mechanical"]);
    mockDetectRoleTitles.mockReturnValue(["eng-mechanical"]);
    mockDedupHash.mockReturnValue("hash123");
    mockContentHash.mockReturnValue("content-hash-123");
    (prisma.posting.findUnique as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({
        id: 1,
        dedupHash: "hash123",
        postedAt: null,
        publishedAt: null,
        firstSeenAt: new Date(),
      });
    (prisma.posting.upsert as ReturnType<typeof vi.fn>).mockResolvedValue({ id: 1 });

    const manager = new SourcesManager(
      [mockAdapter],
      onNewPosting,
      onError,
      new Date("2026-09-02T18:00:00Z")
    );
    await manager.runOnce("workday");

    expect(prisma.posting.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({ postedAt: null }),
      })
    );
    expect(onNewPosting).toHaveBeenCalledWith(
      expect.objectContaining({
        title: "Mechanical Engineering Intern (Summer 2027)",
        company: "RTX",
        sourceName: "workday",
        roleFamily: ["mechanical"],
      }),
      "hash123"
    );
  });

  it("uses the ATS listing date in Discord when GitHub only knows list age", async () => {
    mockAdapter.name = "github";
    mockAdapter.fetchNewPostings = vi.fn().mockResolvedValue([
      {
        title: "Software Engineer Intern, Cloud Services (Summer 2027)",
        company: "HP IQ",
        location: "San Francisco, CA",
        url: "https://job-boards.greenhouse.io/hpiq/jobs/6111955004",
        externalId: "ext1",
        publishedAt: "2026-09-02T07:57:00.000Z",
        raw: { ageDays: 0 },
      },
    ]);
    mockDetectLevel.mockReturnValue("internship");
    mockDetectRoleFamily.mockReturnValue(["swe"]);
    mockDetectRoleTitles.mockReturnValue(["swe-backend"]);
    mockDedupHash.mockReturnValue("hash123");
    mockContentHash.mockReturnValue("content-hash-123");
    mockResolveAtsPublishedAt.mockResolvedValue(new Date("2026-08-31T19:24:19.000Z"));
    (prisma.posting.findUnique as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({
        id: 1,
        dedupHash: "hash123",
        postedAt: null,
        publishedAt: new Date("2026-09-02T07:57:00.000Z"),
        firstSeenAt: new Date("2026-09-02T07:57:00.000Z"),
      });
    (prisma.posting.upsert as ReturnType<typeof vi.fn>).mockResolvedValue({ id: 1 });

    const manager = new SourcesManager(
      [mockAdapter],
      onNewPosting,
      onError,
      new Date("2026-09-02T00:00:00Z")
    );
    await manager.runOnce("github");

    expect(mockResolveAtsPublishedAt).toHaveBeenCalledWith(
      "https://job-boards.greenhouse.io/hpiq/jobs/6111955004"
    );
    expect(onNewPosting).toHaveBeenCalledWith(
      expect.objectContaining({
        postedAt: new Date("2026-08-31T19:24:19.000Z"),
      }),
      "hash123"
    );
  });

  it("counts content-hash hits as droppedDuplicate", async () => {
    mockAdapter.fetchNewPostings = vi.fn().mockResolvedValue([
      { title: "Intern", company: "Acme", url: "https://a.com/1", raw: {} },
    ]);
    mockDetectLevel.mockReturnValue("internship");
    mockDetectRoleFamily.mockReturnValue(["swe"]);
    mockDetectRoleTitles.mockReturnValue([]);
    mockDedupHash.mockReturnValue("hash123");
    mockContentHash.mockReturnValue("content-hash-123");
    (prisma.posting.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: 9,
      contentHash: "content-hash-123",
      postedAt: new Date(),
    });

    const manager = new SourcesManager([mockAdapter], onNewPosting, onError);
    await manager.runOnce("test");

    expect(onNewPosting).not.toHaveBeenCalled();
    expect(prisma.posting.upsert).not.toHaveBeenCalled();
    const call = (prisma.source.upsert as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(call.create.droppedDuplicate).toBe(1);
    expect(call.create.droppedUnclassified).toBe(0);
  });

  it("does not call onNewPosting for already-posted duplicates", async () => {
    mockAdapter.fetchNewPostings = vi.fn().mockResolvedValue([
      { title: "Intern", company: "Acme", url: "https://a.com/1", raw: {} },
    ]);
    mockDetectLevel.mockReturnValue("internship");
    mockDetectRoleFamily.mockReturnValue(["swe"]);
    mockDetectRoleTitles.mockReturnValue([]);
    mockDedupHash.mockReturnValue("hash123");
    (prisma.posting.upsert as ReturnType<typeof vi.fn>).mockResolvedValue({ id: 1 });
    (prisma.posting.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: 1,
      dedupHash: "hash123",
      postedAt: new Date(),
    });

    const manager = new SourcesManager([mockAdapter], onNewPosting, onError);
    await manager.runOnce("test");

    expect(onNewPosting).not.toHaveBeenCalled();
  });

  it("tracks source health after run", async () => {
    mockAdapter.fetchNewPostings = vi.fn().mockResolvedValue([]);
    (prisma.source.upsert as ReturnType<typeof vi.fn>).mockResolvedValue({ name: "test" });

    const manager = new SourcesManager([mockAdapter], onNewPosting, onError);
    await manager.runOnce("test");

    expect(prisma.source.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { name: "test" },
      })
    );
  });

  it("reports errors via onError and updates health", async () => {
    const testError = new Error("Network failure");
    mockAdapter.fetchNewPostings = vi.fn().mockRejectedValue(testError);

    const manager = new SourcesManager([mockAdapter], onNewPosting, onError);
    await manager.runOnce("test");

    expect(onError).toHaveBeenCalledWith("test", testError);
    const call = (prisma.source.upsert as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(call.create.lastError).toBe("Network failure");
  });

  it("start() runs all adapters immediately and sets intervals", async () => {
    vi.useFakeTimers();
    const adapter1: SourceAdapter = {
      name: "a1", pollIntervalSec: 10,
      fetchNewPostings: vi.fn().mockResolvedValue([]),
    };
    const adapter2: SourceAdapter = {
      name: "a2", pollIntervalSec: 20,
      fetchNewPostings: vi.fn().mockResolvedValue([]),
    };

    const manager = new SourcesManager([adapter1, adapter2], onNewPosting, onError);
    manager.start();

    expect(adapter1.fetchNewPostings).toHaveBeenCalledTimes(1);
    expect(adapter2.fetchNewPostings).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(10000);
    expect(adapter1.fetchNewPostings).toHaveBeenCalledTimes(2);

    vi.advanceTimersByTime(10000);
    expect(adapter2.fetchNewPostings).toHaveBeenCalledTimes(2);

    manager.stop();
    vi.useRealTimers();
  });

  it("stop() clears all intervals", async () => {
    vi.useFakeTimers();
    const adapter = { name: "a", pollIntervalSec: 10, fetchNewPostings: vi.fn().mockResolvedValue([]) };

    const manager = new SourcesManager([adapter], onNewPosting, onError);
    manager.start();

    expect(adapter.fetchNewPostings).toHaveBeenCalledTimes(1);

    manager.stop();
    vi.advanceTimersByTime(10000);
    expect(adapter.fetchNewPostings).toHaveBeenCalledTimes(1);

    vi.useRealTimers();
  });
});
