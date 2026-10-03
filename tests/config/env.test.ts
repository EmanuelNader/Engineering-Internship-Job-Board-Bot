import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { validateEnv } from "@/config/env";

describe("validateEnv", () => {
  const original = { ...process.env };

  beforeEach(() => {
    process.env = { ...original };
  });

  afterEach(() => {
    process.env = { ...original };
  });

  it("returns parsed config when required vars present", () => {
    process.env.DISCORD_TOKEN = "tok";
    process.env.DATABASE_URL = "file:./dev.db";
    process.env.BACKFILL = "true";
    process.env.BACKFILL_LIMIT = "5";

    const env = validateEnv();
    expect(env.DISCORD_TOKEN).toBe("tok");
    expect(env.DATABASE_URL).toBe("file:./dev.db");
    expect(env.BACKFILL).toBe(true);
    expect(env.BACKFILL_LIMIT).toBe(5);
  });

  it("defaults BACKFILL to false, BACKFILL_LIMIT to 50, and GITHUB_MAX_AGE_DAYS to 14", () => {
    process.env.DISCORD_TOKEN = "tok";
    process.env.DATABASE_URL = "file:./dev.db";
    delete process.env.BACKFILL;
    delete process.env.BACKFILL_LIMIT;
    delete process.env.GITHUB_MAX_AGE_DAYS;
    delete process.env.LISTINGS_REPO;
    delete process.env.LISTINGS_BRANCH;

    const env = validateEnv();
    expect(env.BACKFILL).toBe(false);
    expect(env.BACKFILL_LIMIT).toBe(50);
    expect(env.GITHUB_MAX_AGE_DAYS).toBe(14);
    expect(env.GITHUB_TOKEN).toBeUndefined();
    expect(env.INITIAL_LOOKBACK_DAYS).toBe(7);
    expect(env.LISTINGS_REPO).toBeUndefined();
    expect(env.LISTINGS_BRANCH).toBe("main");
  });

  it("throws when INITIAL_LOOKBACK_DAYS is negative", () => {
    process.env.DISCORD_TOKEN = "tok";
    process.env.DATABASE_URL = "file:./dev.db";
    process.env.INITIAL_LOOKBACK_DAYS = "-1";
    expect(() => validateEnv()).toThrow(/INITIAL_LOOKBACK_DAYS/);
  });

  it("throws when GITHUB_MAX_AGE_DAYS is not a positive number", () => {
    process.env.DISCORD_TOKEN = "tok";
    process.env.DATABASE_URL = "file:./dev.db";
    process.env.GITHUB_MAX_AGE_DAYS = "0";
    expect(() => validateEnv()).toThrow(/GITHUB_MAX_AGE_DAYS/);
  });

  it("throws when DISCORD_TOKEN missing", () => {
    delete process.env.DISCORD_TOKEN;
    process.env.DATABASE_URL = "file:./dev.db";
    expect(() => validateEnv()).toThrow(/DISCORD_TOKEN/);
  });

  it("throws when DATABASE_URL missing", () => {
    process.env.DISCORD_TOKEN = "tok";
    delete process.env.DATABASE_URL;
    expect(() => validateEnv()).toThrow(/DATABASE_URL/);
  });

  it("parses LISTINGS_REPO and rejects a value that is not owner/repo", () => {
    process.env.DISCORD_TOKEN = "tok";
    process.env.DATABASE_URL = "file:./dev.db";
    process.env.LISTINGS_REPO = "acme/board";
    process.env.LISTINGS_BRANCH = "listings";
    const env = validateEnv();
    expect(env.LISTINGS_REPO).toBe("acme/board");
    expect(env.LISTINGS_BRANCH).toBe("listings");

    process.env.LISTINGS_REPO = "not a repo";
    expect(() => validateEnv()).toThrow(/LISTINGS_REPO/);
  });
});
