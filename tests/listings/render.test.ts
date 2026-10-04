import { describe, expect, it } from "vitest";
import { formatAge, renderInternshipFiles, toListings, type DeliveredPosting } from "@/listings/render";

const NOW = new Date("2026-10-03T18:00:00.000Z");

function row(overrides: Partial<DeliveredPosting> = {}): DeliveredPosting {
  return {
    dedupHash: "hash-new",
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
    ...overrides,
  };
}

describe("formatAge", () => {
  it("uses days, then weeks, then months", () => {
    expect(formatAge(new Date("2026-10-03T01:00:00.000Z"), NOW)).toBe("0d");
    expect(formatAge(new Date("2026-10-02T15:00:00.000Z"), NOW)).toBe("1d");
    expect(formatAge(new Date("2026-09-19T00:00:00.000Z"), NOW)).toBe("2w");
    expect(formatAge(new Date("2026-08-04T00:00:00.000Z"), NOW)).toBe("2mo");
  });
});

describe("renderInternshipFiles", () => {
  it("renders newest roles first with an apply link and age", () => {
    const files = renderInternshipFiles(
      [
        row({
          dedupHash: "older",
          title: "Backend Intern",
          publishedAt: new Date("2026-09-19T00:00:00.000Z"),
        }),
        row(),
      ],
      NOW
    );

    const listings = JSON.parse(files.json) as { id: string; date_posted: string }[];
    expect(listings.map((listing) => listing.id)).toEqual(["hash-new", "older"]);
    expect(files.markdown).toContain("[What it scrapes](SOURCES.md)");
    expect(files.markdown).toContain("[How the bot works](BOT.md)");
    expect(files.readme).toContain("[What it scrapes](docs/SOURCES.md)");
    expect(files.readme).toContain("[How the bot works](docs/BOT.md)");
    expect(files.markdown).toContain("## Browse by category");
    expect(files.markdown).toContain("- [Software Engineering](#software-engineering) (2)");
    expect(files.markdown).toContain("## Software Engineering");
    expect(files.markdown).toContain("[Back to top](#browse-by-category)");
    expect(files.markdown).toContain(
      "| [Stripe](https://boards.greenhouse.io/stripe/jobs/1) | Software Engineer Intern | San Francisco, CA | [Apply](https://boards.greenhouse.io/stripe/jobs/1) | 1d |"
    );
    expect(files.markdown.indexOf("Software Engineer Intern")).toBeLessThan(files.markdown.indexOf("Backend Intern"));
    expect(files.markdown).toContain("| Backend Intern |");
    expect(files.markdown).toContain("| 2w |");
    expect(files.markdown).not.toContain("## Machine Learning");
  });

  it("repeats a role in each matching family", () => {
    const files = renderInternshipFiles(
      [
        row({
          roleFamily: JSON.stringify(["ml", "swe"]),
          title: "Machine Learning Intern",
          url: "https://jobs.ashbyhq.com/openai/abc",
        }),
      ],
      NOW
    );

    const swe = files.markdown.indexOf("## Software Engineering");
    const ml = files.markdown.indexOf("## Machine Learning");
    expect(swe).toBeGreaterThan(-1);
    expect(ml).toBeGreaterThan(swe);
    expect(files.markdown.split("[Apply](https://jobs.ashbyhq.com/openai/abc)").length - 1).toBe(2);
    expect(toListings([row({ roleFamily: JSON.stringify(["ml", "swe", "nope"]) })])[0].role_families).toEqual([
      "ml",
      "swe",
    ]);
  });

  it("escapes table pipes and missing locations", () => {
    const files = renderInternshipFiles(
      [
        row({
          title: "Firmware | Intern",
          location: null,
          url: "https://example.com/job(1)",
        }),
      ],
      NOW
    );

    expect(files.markdown).toContain("Firmware \\| Intern");
    expect(files.markdown).toContain("| — |");
    expect(files.markdown).toContain("[Apply](https://example.com/job%281%29)");
  });
});
