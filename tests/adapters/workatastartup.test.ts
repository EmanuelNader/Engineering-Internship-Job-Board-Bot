import { describe, it, expect, beforeEach } from "vitest";
import nock from "nock";
import { createWorkatastartupAdapter, parseWaasPage } from "@/adapters/workatastartup";

function pageHtml(jobs: unknown[], total: number, version = "v1"): string {
  const payload = {
    component: "jobs/public/pages/JobsV2Page",
    props: { jobs, totalJobsCount: total },
    version,
  };
  const encoded = JSON.stringify(payload).replace(/&/g, "&amp;").replace(/"/g, "&quot;");
  return `<html><div id="app" data-page="${encoded}"></div></html>`;
}

function pageJson(jobs: unknown[], total: number, version = "v1"): string {
  return JSON.stringify({
    component: "jobs/public/pages/JobsV2Page",
    props: { jobs, totalJobsCount: total },
    version,
  });
}

describe("Work at a Startup adapter", () => {
  const adapter = createWorkatastartupAdapter();

  beforeEach(() => nock.cleanAll());

  it("keeps internships from later pages and drops full-time rows", async () => {
    nock("https://www.workatastartup.com")
      .get("/jobs")
      .query({ role: "eng", page: "1" })
      .reply(
        200,
        pageHtml(
          [
            {
              id: 1,
              title: "Software Engineer",
              jobType: "Full-time",
              location: "San Francisco, CA, US",
              companyName: "Acme",
            },
            {
              id: 106942,
              title: "Software Engineer Intern",
              jobType: "Internship",
              location: "San Francisco, CA, US",
              companyName: "Rational",
            },
          ],
          3
        )
      );
    nock("https://www.workatastartup.com")
      .get("/jobs")
      .query({ role: "eng", page: "2" })
      .reply(
        200,
        pageJson(
          [
            {
              id: 106943,
              title: "Machine Learning Intern",
              jobType: "Internship",
              location: "New York, NY, US",
              companyName: "Rational",
            },
          ],
          3
        )
      );
    nock("https://www.workatastartup.com")
      .get("/jobs")
      .query({ role: "marketing", page: "1" })
      .reply(
        200,
        pageHtml(
          [
            {
              id: 200,
              title: "Growth Marketing Intern",
              jobType: "Internship",
              location: "Remote (US)",
              companyName: "Pennant",
            },
            {
              id: 201,
              title: "Marketing Intern",
              jobType: "Internship",
              location: "Austin, TX, US",
              companyName: "Pennant",
            },
          ],
          2
        )
      );

    const postings = await adapter.fetchNewPostings();
    expect(nock.isDone()).toBe(true);
    expect(postings.map((posting) => posting.title)).toEqual([
      "Software Engineer Intern",
      "Machine Learning Intern",
      "Growth Marketing Intern",
      "Marketing Intern",
    ]);
    expect(postings[0]).toMatchObject({
      company: "Rational",
      location: "San Francisco, CA, US",
      externalId: "106942",
      url: "https://www.workatastartup.com/jobs/106942",
    });
    expect(postings[0].publishedAt).toBeUndefined();
    expect(postings.some((posting) => posting.title === "Software Engineer")).toBe(false);
  });

  it("reads an Inertia payload embedded in HTML", () => {
    const page = parseWaasPage(
      pageHtml(
        [{ id: 5, title: "Growth Intern", jobType: "Internship", companyName: "Acme", location: "" }],
        1
      )
    );
    expect(page.jobs).toHaveLength(1);
    expect(page.totalJobsCount).toBe(1);
    expect(page.version).toBe("v1");
  });

  it("keeps the other role when one search fails", async () => {
    nock("https://www.workatastartup.com")
      .get("/jobs")
      .query({ role: "eng", page: "1" })
      .reply(500);
    nock("https://www.workatastartup.com")
      .get("/jobs")
      .query({ role: "marketing", page: "1" })
      .reply(
        200,
        pageHtml(
          [
            {
              id: 9,
              title: "Growth Marketing Intern",
              jobType: "Internship",
              location: "Seattle, WA, US",
              companyName: "Acme",
            },
          ],
          1
        )
      );

    const postings = await adapter.fetchNewPostings();
    expect(postings).toHaveLength(1);
    expect(postings[0].url).toBe("https://www.workatastartup.com/jobs/9");
  });

  it("throws when every role search fails", async () => {
    nock("https://www.workatastartup.com")
      .persist()
      .get("/jobs")
      .query(true)
      .reply(500);

    await expect(adapter.fetchNewPostings()).rejects.toThrow(/workatastartup/i);
  });
});
