import { describe, it, expect } from "vitest";
import { adapterConfigs } from "@/config/adapters.config";

function config(name: string) {
  const found = adapterConfigs.find((c) => c.name === name);
  if (!found) throw new Error(`missing ${name}`);
  return found;
}

describe("adapterConfigs", () => {
  it("disables Simplify until it has companies", () => {
    expect(config("simplify").enabled).toBe(false);
    expect(config("simplify").companies).toHaveLength(0);
  });

  it("enables Greenhouse, Ashby, Lever, Workday, iCIMS, GitHub, and Work at a Startup", () => {
    expect(config("greenhouse").enabled).toBe(true);
    expect(config("ashby").enabled).toBe(true);
    expect(config("lever").enabled).toBe(true);
    expect(config("workday").enabled).toBe(true);
    expect(config("icims").enabled).toBe(true);
    expect(config("github").enabled).toBe(true);
    expect(config("workatastartup").enabled).toBe(true);
    expect(config("workatastartup").pollIntervalSec).toBe(900);
    expect(config("workatastartup").companies).toEqual(["eng", "marketing"]);
  });

  it("stores iCIMS career hosts for the eight non-tech boards", () => {
    const boards = config("icims").icimsBoards ?? [];
    expect(boards).toHaveLength(8);
    expect(boards.every((b) => b.host.endsWith(".icims.com"))).toBe(true);
  });

  it("points GitHub at Summer 2027 README tables including off-season", () => {
    expect(config("github").companies).toEqual([
      "SimplifyJobs/Summer2027-Internships",
      "SimplifyJobs/Summer2027-Internships#README-Off-Season.md",
      "vanshb03/Summer2027-Internships",
      "speedyapply/2027-SWE-College-Jobs",
    ]);
  });

  it("stores per-tenant Workday CXS boards instead of a hardcoded wd1 host", () => {
    const boards = config("workday").workdayBoards ?? [];
    expect(boards.length).toBeGreaterThan(0);
    expect(boards.every((b) => b.host && b.tenant && b.site)).toBe(true);
    expect(boards.some((b) => b.host.includes("wd1") && boards.some((x) => x.host.includes("wd5")))).toBe(true);
  });

  it("leaves custom ATS disabled", () => {
    expect(config("custom").enabled).toBe(false);
  });
});
