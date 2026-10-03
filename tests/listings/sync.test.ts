import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import nock from "nock";
import { gitBlobSha } from "@/listings/github";
import { renderInternshipFiles, spliceListings, type DeliveredPosting } from "@/listings/render";
import { createListingsSync } from "@/listings/sync";

const API = "https://api.github.com";
const NOW = new Date("2026-10-03T18:00:00.000Z");

function row(): DeliveredPosting {
  return {
    dedupHash: "hash-1",
    title: "Software Engineer Intern",
    company: "Stripe",
    location: "San Francisco, CA",
    url: "https://boards.greenhouse.io/stripe/jobs/1",
    level: "internship",
    sourceName: "greenhouse",
    roleFamily: JSON.stringify(["swe"]),
    publishedAt: new Date("2026-10-02T15:00:00.000Z"),
    postedAt: new Date("2026-10-02T16:00:00.000Z"),
    firstSeenAt: new Date("2026-10-02T16:00:00.000Z"),
  };
}

const README = "<!-- listings:start -->\nold\n<!-- listings:end -->\n# Bot\n";

function renderedFiles() {
  const rendered = renderInternshipFiles([row()], NOW);
  const readme = spliceListings(README, rendered.markdown);
  return {
    jsonSha: gitBlobSha(rendered.json),
    markdownSha: gitBlobSha(rendered.markdown),
    readmeSha: gitBlobSha(readme),
  };
}

describe("createListingsSync", () => {
  beforeEach(() => {
    nock.disableNetConnect();
    nock.cleanAll();
  });

  afterEach(() => {
    nock.cleanAll();
    nock.enableNetConnect();
    vi.useRealTimers();
  });

  it("does nothing when LISTINGS_REPO is unset", async () => {
    const loadDelivered = vi.fn();
    const sync = createListingsSync({ token: "tok", loadDelivered });
    sync.schedule();
    await sync.flush();
    expect(loadDelivered).not.toHaveBeenCalled();
  });

  it("skips the commit when both blobs already match", async () => {
    const { jsonSha, markdownSha, readmeSha } = renderedFiles();
    nock(API).get("/repos/acme/board/git/ref/heads/main").reply(200, { object: { sha: "commitsha" } });
    nock(API).get("/repos/acme/board/git/commits/commitsha").reply(200, { tree: { sha: "rootsha" } });
    nock(API).get("/repos/acme/board/git/trees/rootsha").reply(200, {
      sha: "rootsha",
      tree: [
        { path: "README.md", type: "blob", sha: readmeSha },
        { path: "data", type: "tree", sha: "datatree" },
        { path: "docs", type: "tree", sha: "docstree" },
      ],
    });
    nock(API).get("/repos/acme/board/git/trees/datatree").reply(200, {
      sha: "datatree",
      tree: [{ path: "listings.json", type: "blob", sha: jsonSha }],
    });
    nock(API).get("/repos/acme/board/git/trees/docstree").reply(200, {
      sha: "docstree",
      tree: [{ path: "internships.md", type: "blob", sha: markdownSha }],
    });

    const sync = createListingsSync({
      token: "tok",
      repo: "acme/board",
      now: () => NOW,
      loadDelivered: async () => [row()],
      readReadme: async () => README,
    });
    await sync.flush();
    expect(nock.isDone()).toBe(true);
  });

  it("commits listings.json and internships.md in one revision", async () => {
    const blobs: { content: string }[] = [];
    let treeBody: { base_tree: string; tree: { path: string; sha: string }[] } | undefined;

    nock(API).get("/repos/acme/board/git/ref/heads/main").reply(200, { object: { sha: "commitsha" } });
    nock(API).get("/repos/acme/board/git/commits/commitsha").reply(200, { tree: { sha: "rootsha" } });
    nock(API).get("/repos/acme/board/git/trees/rootsha").reply(200, { sha: "rootsha", tree: [] });
    nock(API)
      .post("/repos/acme/board/git/blobs", (body: { content: string }) => {
        blobs.push(body);
        return true;
      })
      .reply(201, { sha: "sha-json" });
    nock(API)
      .post("/repos/acme/board/git/blobs", (body: { content: string }) => {
        blobs.push(body);
        return true;
      })
      .reply(201, { sha: "sha-md" });
    nock(API)
      .post("/repos/acme/board/git/blobs", (body: { content: string }) => {
        blobs.push(body);
        return true;
      })
      .reply(201, { sha: "sha-readme" });
    nock(API)
      .post("/repos/acme/board/git/trees", (body: { base_tree: string; tree: { path: string; sha: string }[] }) => {
        treeBody = body;
        return true;
      })
      .reply(201, { sha: "treesha" });
    nock(API)
      .post("/repos/acme/board/git/commits", (body: { message: string; tree: string; parents: string[] }) => {
        expect(body.message).toBe("Update internship listings");
        expect(body.tree).toBe("treesha");
        expect(body.parents).toEqual(["commitsha"]);
        return true;
      })
      .reply(201, { sha: "newcommit" });
    nock(API)
      .patch("/repos/acme/board/git/refs/heads/main", (body: { sha: string }) => {
        expect(body.sha).toBe("newcommit");
        return true;
      })
      .reply(200, { ref: "refs/heads/main", object: { sha: "newcommit" } });

    const sync = createListingsSync({
      token: "tok",
      repo: "acme/board",
      now: () => NOW,
      loadDelivered: async () => [row()],
      readReadme: async () => README,
    });
    await sync.flush();

    expect(nock.isDone()).toBe(true);
    expect(blobs).toHaveLength(3);
    expect(blobs[0].content).toContain('"company_name": "Stripe"');
    expect(blobs[1].content).toContain("## Software Engineering");
    expect(blobs[1].content).toContain("| Company | Role | Location | Application | Age |");
    expect(blobs[2].content).toContain("# Bot");
    expect(treeBody).toEqual({
      base_tree: "rootsha",
      tree: [
        { path: "data/listings.json", mode: "100644", type: "blob", sha: "sha-json" },
        { path: "docs/internships.md", mode: "100644", type: "blob", sha: "sha-md" },
        { path: "README.md", mode: "100644", type: "blob", sha: "sha-readme" },
      ],
    });
  });

  it("logs a GitHub failure and still resolves", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    nock(API).get("/repos/acme/board/git/ref/heads/main").reply(500, "nope");
    const sync = createListingsSync({
      token: "tok",
      repo: "acme/board",
      now: () => NOW,
      loadDelivered: async () => [row()],
    });
    await expect(sync.flush()).resolves.toBeUndefined();
    expect(error).toHaveBeenCalledWith(expect.stringMatching(/Internship list sync failed/));
    error.mockRestore();
  });

  it("coalesces a burst into one flush after the debounce", async () => {
    vi.useFakeTimers();
    const loadDelivered = vi.fn().mockResolvedValue([]);
    const sync = createListingsSync({
      token: "tok",
      repo: "acme/board",
      debounceMs: 20_000,
      loadDelivered,
    });
    sync.schedule();
    sync.schedule();
    await vi.advanceTimersByTimeAsync(19_000);
    expect(loadDelivered).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1_000);
    expect(loadDelivered).toHaveBeenCalledTimes(1);
  });

  it("does not flush after stop", async () => {
    vi.useFakeTimers();
    const loadDelivered = vi.fn().mockResolvedValue([]);
    const sync = createListingsSync({
      token: "tok",
      repo: "acme/board",
      debounceMs: 20_000,
      loadDelivered,
    });
    sync.schedule();
    sync.stop();
    await vi.advanceTimersByTimeAsync(20_000);
    expect(loadDelivered).not.toHaveBeenCalled();
  });
});

describe("gitBlobSha", () => {
  it("matches the git blob id for a short payload", () => {
    expect(gitBlobSha("hello\n")).toBe("ce013625030ba8dba906f756967f9e9ca394464a");
  });
});
