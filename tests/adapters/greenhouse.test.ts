import { describe, it, expect, beforeEach } from "vitest";
import nock from "nock";
import { createGreenhouseAdapter } from "@/adapters/greenhouse";
import { adapterConfigs } from "@/config/adapters.config";

const EMPTY_BODY = { jobs: [], meta: { total: 0 } };
const greenhouseCompanies = adapterConfigs.find((c) => c.name === "greenhouse")!.companies;

function nockGreenhouseEmpty(except: string[] = []) {
  for (const company of greenhouseCompanies) {
    if (except.includes(company)) continue;
    nock("https://boards-api.greenhouse.io")
      .get(`/v1/boards/${company}/jobs`)
      .query({ content: "Job" })
      .reply(200, EMPTY_BODY);
  }
}

describe("Greenhouse Adapter", () => {
  const adapter = createGreenhouseAdapter();

  beforeEach(() => {
    nock.cleanAll();
    nockGreenhouseEmpty(["spacex"]);
  });

  it("fetches and parses jobs from Greenhouse boards API", async () => {
    const fixture = {
      jobs: [
        {
          id: 123,
          title: "Software Engineer Intern",
          location: { name: "Mountain View, CA" },
          absolute_url: "https://boards.greenhouse.io/spacex/jobs/123",
          company_name: "SpaceX",
          first_published: "2026-06-15T10:00:00-04:00",
        },
        {
          id: 456,
          title: "Senior Software Engineer",
          location: { name: "New York, NY" },
          absolute_url: "https://boards.greenhouse.io/spacex/jobs/456",
          company_name: "SpaceX",
          first_published: "2026-06-20T10:00:00-04:00",
        },
      ],
      meta: { total: 2 },
    };

    nock("https://boards-api.greenhouse.io")
      .get("/v1/boards/spacex/jobs")
      .query({ content: "Job" })
      .reply(200, fixture);

    const postings = await adapter.fetchNewPostings();
    expect(postings).toHaveLength(2);
    expect(postings[0]).toMatchObject({
      title: "Software Engineer Intern",
      company: "SpaceX",
      externalId: "123",
      url: "https://boards.greenhouse.io/spacex/jobs/123",
      publishedAt: "2026-06-15T10:00:00-04:00",
    });
    expect(postings[1].title).toBe("Senior Software Engineer");
    expect(postings[1].publishedAt).toBe("2026-06-20T10:00:00-04:00");
    expect(adapter.liveJobIdsByBoard?.get("spacex")).toEqual(new Set(["123", "456"]));
  });

  it("handles empty response", async () => {
    nock("https://boards-api.greenhouse.io")
      .get("/v1/boards/spacex/jobs")
      .query({ content: "Job" })
      .reply(200, { jobs: [], meta: { total: 0 } });

    const postings = await adapter.fetchNewPostings();
    expect(postings).toHaveLength(0);
  });

  it("isolates a single company HTTP error and keeps sibling boards", async () => {
    nock.cleanAll();
    nock("https://boards-api.greenhouse.io")
      .get("/v1/boards/spacex/jobs")
      .query({ content: "Job" })
      .reply(500);
    nock("https://boards-api.greenhouse.io")
      .get("/v1/boards/andurilindustries/jobs")
      .query({ content: "Job" })
      .reply(200, {
        jobs: [
          {
            id: 789,
            title: "Software Intern",
            location: { name: "Costa Mesa, CA" },
            absolute_url: "https://boards.greenhouse.io/andurilindustries/jobs/789",
            company_name: "Anduril",
          },
        ],
        meta: { total: 1 },
      });
    nockGreenhouseEmpty(["spacex", "andurilindustries"]);

    const postings = await adapter.fetchNewPostings();
    expect(postings).toHaveLength(1);
    expect(postings[0].company).toBe("Anduril");
    expect(postings[0].externalId).toBe("789");
    expect(adapter.liveJobIdsByBoard?.has("spacex")).toBe(false);
    expect(adapter.liveJobIdsByBoard?.get("andurilindustries")).toEqual(new Set(["789"]));
  });

  it("returns empty when one company fails and siblings are empty", async () => {
    nock("https://boards-api.greenhouse.io")
      .get("/v1/boards/spacex/jobs")
      .query({ content: "Job" })
      .reply(500);

    const postings = await adapter.fetchNewPostings();
    expect(postings).toHaveLength(0);
  });

  it("throws AdapterError when every company fails", async () => {
    nock.cleanAll();
    for (const company of greenhouseCompanies) {
      nock("https://boards-api.greenhouse.io")
        .get(`/v1/boards/${company}/jobs`)
        .query({ content: "Job" })
        .reply(500);
    }

    await expect(adapter.fetchNewPostings()).rejects.toThrow(/greenhouse/i);
  });
});
