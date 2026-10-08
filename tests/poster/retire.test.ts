import { describe, expect, it } from "vitest";
import { greenhouseBoardFor, greenhousePostingsToDrop, type GreenhousePostingRow } from "@/poster/retire";

function row(overrides: Partial<GreenhousePostingRow> & Pick<GreenhousePostingRow, "dedupHash" | "url">): GreenhousePostingRow {
  return {
    title: "Machine Learning Intern",
    company: "Pinterest",
    sourceName: "github",
    firstSeenAt: new Date("2026-10-01T00:00:00Z"),
    channelIds: null,
    ...overrides,
  };
}

const live = new Map<string, Set<string>>([["pinterest", new Set(["8140140"])]]);

describe("greenhousePostingsToDrop", () => {
  it("drops a Greenhouse job that left the board and the shortened GitHub copy of a live job", () => {
    const fall = row({
      dedupHash: "fall",
      title: "PhD Machine Learning Internship 2027 (USA) *Fall",
      url: "https://www.pinterestcareers.com/jobs/?gh_jid=8140150",
      sourceName: "greenhouse",
    });
    const greenhouse = row({
      dedupHash: "gh",
      title: "PhD Machine Learning Internship 2027 (USA)",
      url: "https://www.pinterestcareers.com/jobs/?gh_jid=8140140",
      sourceName: "greenhouse",
      firstSeenAt: new Date("2026-10-01T17:01:32Z"),
    });
    const github = row({
      dedupHash: "readme",
      title: "Machine Learning Intern 🎓",
      company: "🔥 Pinterest",
      url: "https://www.pinterestcareers.com/jobs/?gh_jid=8140140&utm_source=Simplify&ref=Simplify",
    });

    const drop = greenhousePostingsToDrop([fall, greenhouse, github], live);
    expect(drop.map((posting) => posting.dedupHash).sort()).toEqual(["fall", "readme"]);
  });

  it("keeps a live Greenhouse job that has no duplicate", () => {
    const greenhouse = row({
      dedupHash: "gh",
      url: "https://www.pinterestcareers.com/jobs/?gh_jid=8140140",
      sourceName: "greenhouse",
    });
    expect(greenhousePostingsToDrop([greenhouse], live)).toEqual([]);
  });

  it("does not close a board whose fetch failed", () => {
    const anduril = row({
      dedupHash: "anduril",
      company: "Anduril",
      title: "Software Intern",
      sourceName: "greenhouse",
      url: "https://boards.greenhouse.io/andurilindustries/jobs/789",
    });
    expect(greenhouseBoardFor("Anduril", anduril.url, ["pinterest"])).toBeNull();
    expect(greenhousePostingsToDrop([anduril], live)).toEqual([]);
  });
});
