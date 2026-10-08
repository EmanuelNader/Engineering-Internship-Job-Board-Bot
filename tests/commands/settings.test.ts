import { describe, it, expect } from "vitest";
import { buildSettingsEmbed } from "@/commands/settings";

describe("settings embed", () => {
  it("lists every family with enabled and channel", () => {
    const embed = buildSettingsEmbed().toJSON();
    expect(embed.title).toMatch(/settings/i);
    expect(embed.description).toContain("#job-board");
    expect(embed.description).toContain("#swe-jobs");
    expect(embed.description).toContain("#other-jobs");
    expect(embed.description).toContain("**Other**");
    expect(embed.description).toMatch(/`on`/);
    expect(embed.description).not.toContain("#design-jobs");
    expect(embed.description).not.toContain("#growth-jobs");
    expect(embed.footer?.text).toMatch(/\/onboard/);
  });
});
