import { describe, it, expect } from "vitest";
import { detectLevel, detectRoleFamily, detectRoleTitles, dedupHash, contentHash, canonicalizeTitleForHash, isUsLocation } from "@/lib/normalize";

describe("detectLevel", () => {
  describe("internship detection", () => {
    it("detects 'internship' in title", () => {
      expect(detectLevel("Software Engineer Internship")).toBe("internship");
    });

    it("detects 'intern' in title", () => {
      expect(detectLevel("Software Engineer Intern")).toBe("internship");
    });

    it("detects 'summer intern' in title", () => {
      expect(detectLevel("Summer Intern Software Engineer")).toBe("internship");
    });

    it("detects 'winter intern' in title", () => {
      expect(detectLevel("Winter Intern Software Engineer")).toBe("internship");
    });

    it("detects 'fall intern' in title", () => {
      expect(detectLevel("Fall Intern Software Engineer")).toBe("internship");
    });

    it("detects 'spring intern' in title", () => {
      expect(detectLevel("Spring Intern Software Engineer")).toBe("internship");
    });

    it("detects 'summer 2025 intern' in title", () => {
      expect(detectLevel("Summer 2025 Intern")).toBe("internship");
    });

    it("detects 'fall 2026 internship' in title", () => {
      expect(detectLevel("Fall 2026 Internship")).toBe("internship");
    });

    it("detects 'spring 2027 intern' in title", () => {
      expect(detectLevel("Spring 2027 Intern")).toBe("internship");
    });

    it("detects '2026 summer intern' in title", () => {
      expect(detectLevel("2026 Summer Intern")).toBe("internship");
    });

    it("is case insensitive", () => {
      expect(detectLevel("SOFTWARE ENGINEER INTERN")).toBe("internship");
      expect(detectLevel("software engineer intern")).toBe("internship");
      expect(detectLevel("Software Engineer Intern")).toBe("internship");
    });

    it("handles whitespace normalization", () => {
      expect(detectLevel("  Software Engineer Intern  ")).toBe("internship");
      expect(detectLevel("Software  Engineer  Intern")).toBe("internship");
    });
  });

  describe("co-op detection", () => {
    it("detects 'co-op' in title", () => {
      expect(detectLevel("Co-op Software Engineer")).toBe("co-op");
    });

    it("detects 'coop' in title", () => {
      expect(detectLevel("Coop Software Engineer")).toBe("co-op");
    });

    it("detects 'cooperative education' in title", () => {
      expect(detectLevel("Cooperative Education Program")).toBe("co-op");
    });

    it("detects 'placement year' in title", () => {
      expect(detectLevel("Placement Year Student")).toBe("co-op");
    });

    it("is case insensitive", () => {
      expect(detectLevel("CO-OP SOFTWARE ENGINEER")).toBe("co-op");
      expect(detectLevel("coop software engineer")).toBe("co-op");
    });

    it("handles whitespace normalization", () => {
      expect(detectLevel("  Co-op Software Engineer  ")).toBe("co-op");
    });
  });

  describe("fellowship detection", () => {
    it("detects 'fellowship' in title", () => {
      expect(detectLevel("Research Fellowship")).toBe("fellowship");
    });

    it("detects 'fellow' in title", () => {
      expect(detectLevel("Software Engineering Fellow")).toBe("fellowship");
    });

    it("detects 'fellows program' in title", () => {
      expect(detectLevel("Fellows Program - Software Engineering")).toBe("fellowship");
    });

    it("detects named fellowships", () => {
      expect(detectLevel("XRDS Fellow")).toBe("fellowship");
      expect(detectLevel("Google PhD Fellowship")).toBe("fellowship");
      expect(detectLevel("Facebook Fellowship")).toBe("fellowship");
      expect(detectLevel("Microsoft Research PhD Fellowship")).toBe("fellowship");
      expect(detectLevel("NVIDIA Graduate Fellowship")).toBe("fellowship");
    });

    it("is case insensitive", () => {
      expect(detectLevel("RESEARCH FELLOWSHIP")).toBe("fellowship");
      expect(detectLevel("software engineering fellow")).toBe("fellowship");
    });

    it("prefers fellowship over internship when both present", () => {
      expect(detectLevel("Software Engineering Fellowship Internship")).toBe("fellowship");
      expect(detectLevel("Fellow Intern Program")).toBe("fellowship");
    });

    it("prefers fellowship over co-op when both present", () => {
      expect(detectLevel("Co-op Fellowship Program")).toBe("fellowship");
    });
  });

  describe("priority ordering", () => {
    it("fellowship > co-op > internship when multiple present", () => {
      expect(detectLevel("Fellowship Co-op Internship")).toBe("fellowship");
      expect(detectLevel("Co-op Internship")).toBe("co-op");
    });
  });

  describe("negative cases", () => {
    it("returns null for full-time role titles", () => {
      expect(detectLevel("Software Engineer")).toBeNull();
      expect(detectLevel("Senior Software Engineer")).toBeNull();
      expect(detectLevel("Staff Software Engineer")).toBeNull();
      expect(detectLevel("Principal Software Engineer")).toBeNull();
    });

    it("returns null for new grad / entry level titles", () => {
      expect(detectLevel("New Grad Software Engineer")).toBeNull();
      expect(detectLevel("Entry Level Software Engineer")).toBeNull();
      expect(detectLevel("Junior Software Engineer")).toBeNull();
    });

    it("returns null for unrelated titles", () => {
      expect(detectLevel("Product Manager")).toBeNull();
      expect(detectLevel("Data Scientist")).toBeNull();
      expect(detectLevel("Engineering Manager")).toBeNull();
    });

    it("returns null for empty string", () => {
      expect(detectLevel("")).toBeNull();
    });

    it("returns null when Workday omits title", () => {
      expect(detectLevel(undefined)).toBeNull();
      expect(detectLevel(null)).toBeNull();
    });

    it("returns null for whitespace only", () => {
      expect(detectLevel("   ")).toBeNull();
    });

    it("returns null for titles containing 'intern' as part of unrelated word", () => {
      expect(detectLevel("Internal Tools Engineer")).toBeNull();
      expect(detectLevel("International Business Developer")).toBeNull();
    });

    it("hard-drops seniority titles without include signal", () => {
      expect(detectLevel("Senior Software Engineer")).toBeNull();
      expect(detectLevel("Staff Engineer")).toBeNull();
      expect(detectLevel("Principal Engineer")).toBeNull();
      expect(detectLevel("Engineering Manager")).toBeNull();
      expect(detectLevel("Manager of Engineering")).toBeNull();
      expect(detectLevel("Head of Engineering")).toBeNull();
      expect(detectLevel("Director of Engineering")).toBeNull();
      expect(detectLevel("VP Engineering")).toBeNull();
      expect(detectLevel("Tech Lead")).toBeNull();
    });

    it("hard-drops new-grad signals even with include signal", () => {
      expect(detectLevel("New Grad Software Engineer Intern")).toBeNull();
      expect(detectLevel("New Graduate Program Intern")).toBeNull();
      expect(detectLevel("Graduate Development Program Intern")).toBeNull();
      expect(detectLevel("Early Career Engineer Intern")).toBeNull();
      expect(detectLevel("Development Program Intern")).toBeNull();
      expect(detectLevel("Rotational Program Intern")).toBeNull();
      expect(detectLevel("Campus Hire Intern")).toBeNull();
      expect(detectLevel("Entry Level Engineer Intern")).toBeNull();
      expect(detectLevel("Campus to Career Intern")).toBeNull();
    });
  });

  describe("seniority with include signal (include wins)", () => {
    it("allows seniority when include signal present", () => {
      expect(detectLevel("Senior Intern")).toBe("internship");
      expect(detectLevel("Staff Co-op")).toBe("co-op");
    });
  });

  describe("edge cases", () => {
    it("handles titles with special characters", () => {
      expect(detectLevel("Software Engineering Intern (Summer 2025)")).toBe("internship");
      expect(detectLevel("Co-op / Intern - Software")).toBe("co-op");
    });

    it("handles titles with numbers", () => {
      expect(detectLevel("Software Engineering Intern 2025")).toBe("internship");
      expect(detectLevel("Co-op 2024 - Software")).toBe("co-op");
    });

    it("handles very long titles", () => {
      const longTitle = "Software Engineering Internship Summer 2025 Remote United States Full Time";
      expect(detectLevel(longTitle)).toBe("internship");
    });
  });
});

describe("detectRoleFamily", () => {
  const cases: [string, import("@/lib/types").RoleFamily[], string][] = [
    // SWE
    ["Frontend Engineer Intern", ["swe"], "frontend keyword"],
    ["Backend Software Engineer Intern", ["swe"], "backend keyword"],
    ["Full Stack Intern", ["swe"], "full stack"],
    ["Mobile Engineer Co-op", ["swe"], "mobile"],
    ["DevOps Intern", ["swe"], "devops"],
    ["Site Reliability Engineer Intern", ["swe"], "sre"],
    ["Embedded Systems Intern", ["swe"], "embedded"],
    ["Software Engineer Intern", ["swe"], "generic swe"],
    // PM/Program
    ["Product Manager Intern", ["pm-program"], "pm"],
    ["Technical Program Manager Intern", ["pm-program"], "tpm"],
    ["Program Manager Co-op", ["pm-program"], "program manager"],
    // Hardware
    ["Silicon Design Intern", ["hardware"], "silicon"],
    ["PCB Layout Co-op", ["hardware"], "pcb"],
    ["FPGA Engineer Intern", ["hardware"], "fpga"],
    ["ASIC Verification Intern", ["hardware"], "asic"],
    // Data
    ["Data Scientist Intern", ["data"], "data scientist"],
    ["Data Engineer Intern", ["data"], "data engineer"],
    ["Analytics Intern", ["data"], "analytics"],
    // ML/AI
    ["Machine Learning Engineer Intern", ["ml"], "ml engineer"],
    ["ML Researcher Co-op", ["ml"], "ml researcher"],
    ["AI Engineer Intern", ["ml"], "ai engineer"],
    // Club engineering tracks (non-SWE)
    ["Structural Engineering Intern", ["civil-structural"], "structural"],
    ["Civil Engineer Co-op", ["civil-structural"], "civil"],
    ["Civil and Structural Engineer Intern", ["civil-structural"], "civil+structural same family"],
    ["Materials and Structures Intern", ["civil-structural"], "materials and structures"],
    ["Materials & Structure Co-op", ["civil-structural"], "materials and structure"],
    ["Construction Manager Intern", ["civil-structural"], "construction manager intern"],
    ["Construction Management Internship", ["civil-structural"], "construction management internship"],
    ["Electrical Engineering Intern", ["electrical"], "electrical"],
    ["Mechanical Engineer Intern", ["mechanical"], "mechanical"],
    ["Chemical Engineering Intern", ["chemical"], "chemical"],
    ["Process Engineer Intern", ["chemical"], "process engineer"],
    ["Process Development Co-op", ["chemical"], "process development"],
    ["Materials Engineering Intern", ["chemical"], "materials engineer"],
    ["Polymer Intern", ["chemical"], "polymer"],
    ["Petroleum Engineering Intern", ["chemical"], "petroleum"],
    ["Refinery Intern", ["chemical"], "refinery"],
    ["Aerospace Engineer Intern", ["aerospace"], "aerospace"],
    ["Propulsion Intern", ["aerospace"], "propulsion"],
    ["Aerodynamics Co-op", ["aerospace"], "aerodynamics"],
    ["Aerostructures Intern", ["aerospace"], "aerostructures"],
    ["Flight Test Intern", ["aerospace"], "flight test"],
    ["Flight Sciences Intern", ["aerospace"], "flight sciences"],
    ["Avionics Intern", ["aerospace"], "avionics"],
    ["GNC Intern", ["aerospace"], "gnc"],
    ["Thermal Engineering Intern", ["mechanical"], "thermal"],
    ["HVAC Intern", ["mechanical"], "hvac"],
    ["Manufacturing Intern", ["mechanical"], "manufacturing"],
    ["Design Engineer Intern", ["mechanical"], "design engineer"],
    ["Manufacturing Engineer Intern", ["mechanical", "chemical"], "manufacturing engineer in both"],
    ["Power Engineering Intern", ["electrical"], "power engineer"],
    ["Controls Engineer Intern", ["electrical"], "controls engineer"],
    ["Control Systems Intern", ["electrical"], "control systems"],
    ["RF Engineer Intern", ["electrical"], "rf"],
    ["Radio Frequency Intern", ["electrical"], "radio frequency"],
    // Design + growth
    ["UX Designer Intern", ["other"], "ux"],
    ["UX Design Intern", ["other"], "ux design"],
    ["UI/UX Intern", ["other"], "ui/ux"],
    ["User Researcher Intern", ["other"], "user research"],
    ["Visual Designer Intern", ["other"], "visual design"],
    ["UI Designer Co-op", ["other"], "ui"],
    ["Product Designer Intern", ["other"], "product design"],
    ["Product Design Intern", ["other"], "product design intern"],
    ["Graphic Design Intern", ["other"], "graphic design"],
    ["Growth Intern", ["other"], "growth intern"],
    ["Product Marketing Intern", ["other"], "product marketing"],
    ["Interaction Designer Intern", ["other"], "interaction"],
    ["Growth Marketing Intern", ["other"], "growth marketing"],
    ["Lifecycle Marketing Intern", ["other"], "lifecycle"],
    ["User Acquisition Intern", ["other"], "acquisition"],
    // Multi-family (title spans families)
    ["Software Engineer Intern - Hardware Team", ["swe", "hardware"], "multi-family"],
    // Unknown
    ["Random Title", [], "unknown"],
    ["", [], "empty"],
  ];

  it.each(cases)("title=%s -> %s (%s)", (title, expected, _label) => {
    expect(detectRoleFamily(title, { title, company: "Test", url: "http://x" })).toEqual(expected);
  });

  it("keeps software engineer on SWE only, not electrical", () => {
    const raw = { title: "Software Engineer Intern", company: "Test", url: "http://x" };
    expect(detectRoleFamily("Software Engineer Intern", raw)).toEqual(["swe"]);
    expect(detectRoleFamily("Software Engineer Intern", raw)).not.toContain("electrical");
    expect(detectRoleFamily("Software Engineering Intern", raw)).not.toContain("electrical");
    expect(detectRoleFamily("Software Design Engineer Intern", raw)).not.toContain("mechanical");
    expect(detectRoleFamily("Product Design Engineer Intern", raw)).toEqual(["mechanical"]);
  });
});

describe("detectRoleTitles", () => {
  const cases: [string, import("@/lib/types").RoleFamily[], import("@/lib/types").RoleTitle[], string][] = [
    // SWE titles
    ["Frontend Engineer Intern", ["swe"], ["swe-frontend"], "frontend"],
    ["Backend Software Engineer Intern", ["swe"], ["swe-backend"], "backend"],
    ["Full Stack Intern", ["swe"], ["swe-fullstack"], "fullstack"],
    ["Mobile Engineer Co-op", ["swe"], ["swe-mobile"], "mobile"],
    ["DevOps Intern", ["swe"], ["swe-devops"], "devops"],
    ["Embedded Systems Intern", ["swe"], ["swe-embedded"], "embedded"],
    ["Software Engineer Intern", ["swe"], [], "generic swe -> no specific title"],
    // Multiple titles in one
    ["Frontend & Backend Engineer Intern", ["swe"], ["swe-frontend", "swe-backend"], "multi-title"],
    // PM/Program
    ["Product Manager Intern", ["pm-program"], ["pm-product"], "pm product"],
    ["Technical Program Manager Intern", ["pm-program"], ["pm-tpm"], "tpm"],
    ["Program Manager Co-op", ["pm-program"], ["pm-program"], "program"],
    // Hardware
    ["Silicon Design Intern", ["hardware"], ["hw-silicon"], "silicon"],
    ["PCB Layout Co-op", ["hardware"], ["hw-pcb"], "pcb"],
    ["FPGA Engineer Intern", ["hardware"], ["hw-fpga"], "fpga"],
    ["ASIC Verification Intern", ["hardware"], ["hw-asic"], "asic"],
    // Data
    ["Data Scientist Intern", ["data"], ["data-scientist"], "data scientist"],
    ["Data Engineer Intern", ["data"], ["data-engineer"], "data engineer"],
    ["Analytics Intern", ["data"], ["data-analytics"], "analytics"],
    // ML
    ["Machine Learning Engineer Intern", ["ml"], ["ml-engineer"], "ml engineer"],
    ["ML Researcher Co-op", ["ml"], ["ml-researcher"], "ml researcher"],
    ["AI Engineer Intern", ["ml"], ["ml-ai-eng"], "ai engineer"],
    // Club engineering tracks
    ["Structural Engineering Intern", ["civil-structural"], ["eng-structural"], "structural"],
    ["Civil Engineer Co-op", ["civil-structural"], ["eng-civil"], "civil"],
    ["Civil Engineer / Structural Engineer Intern", ["civil-structural"], ["eng-structural", "eng-civil"], "civil+structural titles"],
    ["Materials and Structures Intern", ["civil-structural"], ["eng-structural"], "materials and structures"],
    ["Construction Manager Intern", ["civil-structural"], ["eng-civil"], "construction manager intern"],
    ["Electrical Engineering Intern", ["electrical"], ["eng-electrical"], "electrical"],
    ["Mechanical Engineer Intern", ["mechanical"], ["eng-mechanical"], "mechanical"],
    ["Chemical Engineering Intern", ["chemical"], ["eng-chemical"], "chemical"],
    ["Process Engineer Intern", ["chemical"], ["eng-chemical"], "process engineer"],
    ["Aerospace Engineer Intern", ["aerospace"], ["eng-aerospace"], "aerospace"],
    ["Propulsion Intern", ["aerospace"], ["eng-aerospace"], "propulsion"],
    ["Design Engineer Intern", ["mechanical"], ["eng-mechanical"], "design engineer"],
    ["RF Engineer Intern", ["electrical"], ["eng-electrical"], "rf"],
    // Design + growth → other
    ["UX Designer Intern", ["other"], ["design-ux"], "ux"],
    ["UI Designer Co-op", ["other"], ["design-ui"], "ui"],
    ["Product Designer Intern", ["other"], ["design-product"], "product design"],
    ["Interaction Designer Intern", ["other"], ["design-interaction"], "interaction"],
    ["Growth Marketing Intern", ["other"], ["growth-general"], "growth general"],
    ["Lifecycle Marketing Intern", ["other"], ["growth-lifecycle"], "lifecycle"],
    ["User Acquisition Intern", ["other"], ["growth-acquisition"], "acquisition"],
    // Title not in family -> empty
    ["Frontend Engineer Intern", ["data"], [], "wrong family"],
    // Empty
    ["", ["swe"], [], "empty"],
  ];

  it.each(cases)("title=%s families=%s -> %s (%s)", (title, families, expected, _label) => {
    expect(detectRoleTitles(title, families, { title, company: "Test", url: "http://x" })).toEqual(expected);
  });
});

describe("dedupHash", () => {
  const cases: [import("@/lib/types").SourceName, string, string, string, string][] = [
    ["greenhouse", "12345", "Software Engineer Intern", "Google", "expected-hash-1"],
    ["greenhouse", "12345", "software engineer intern", "Google", "expected-hash-1"],
    ["greenhouse", "12345", "  Software Engineer Intern  ", "Google", "expected-hash-1"],
    ["greenhouse", "", "Software Engineer Intern", "Google", "expected-hash-2"],
    ["greenhouse", "", "software engineer intern", "Google", "expected-hash-2"],
    ["ashby", "67890", "Software Engineer Intern", "Google", "expected-hash-3"],
    ["greenhouse", "12345", "Software Engineer Intern", "Microsoft", "expected-hash-4"],
  ];

  it.each(cases)("source=%s extId=%s title=%s company=%s -> stable hash", (src, extId, title, company, _label) => {
    const h1 = dedupHash(src, extId, title, company);
    const h2 = dedupHash(src, extId, title, company);
    expect(h1).toBe(h2);
    expect(h1).toHaveLength(64);
  });

  it("different inputs produce different hashes", () => {
    const h1 = dedupHash("greenhouse", "12345", "Software Engineer Intern", "Google");
    const h2 = dedupHash("greenhouse", "12345", "Software Engineer Intern", "Microsoft");
    expect(h1).not.toBe(h2);
  });
});

describe("contentHash", () => {
  it("treats GitHub list titles and Greenhouse season titles as the same job", () => {
    expect(canonicalizeTitleForHash("Software Engineer Intern (Summer 2027)")).toBe(
      "software engineer intern"
    );
    expect(
      contentHash("Software Engineer Intern", "Figma")
    ).toBe(contentHash("Software Engineer Intern (Summer 2027)", "Figma"));
  });

  it("collapses the same Greenhouse job URL even when titles differ", () => {
    const github = contentHash(
      "Software Engineer Intern",
      "Figma",
      "https://job-boards.greenhouse.io/figma/jobs/4491234008"
    );
    const greenhouse = contentHash(
      "Software Engineer Intern (Summer 2027)",
      "Figma",
      "https://boards.greenhouse.io/figma/jobs/4491234008"
    );
    expect(github).toBe(greenhouse);
  });

  it("keeps different companies distinct when there is no ATS URL", () => {
    expect(contentHash("Software Engineer Intern", "Figma")).not.toBe(
      contentHash("Software Engineer Intern", "Notion")
    );
  });

  it("ignores list emojis, Inc, and SWE abbreviations", () => {
    expect(contentHash("SWE Intern", "🔥 Figma")).toBe(
      contentHash("Software Engineer Intern (Summer 2027)", "Figma, Inc.")
    );
  });

  it("treats Anduril GitHub co-op rows as the Greenhouse season title", () => {
    expect(canonicalizeTitleForHash("Winter 2027 Software Engineer Co-op")).toBe(
      "software engineer coop"
    );
    expect(contentHash("Software Engineer Co-op", "Anduril")).toBe(
      contentHash("Winter 2027 Software Engineer Co-op", "Anduril Industries")
    );
  });

  it("collapses the same Workday requisition and Simplify job id", () => {
    expect(
      contentHash("Intern", "Nvidia", "https://nvidia.wd1.myworkdayjobs.com/en-US/site/job/Foo_JR12345")
    ).toBe(
      contentHash("Intern", "NVIDIA", "https://nvidia.wd1.myworkdayjobs.com/NVIDIAExternalCareerSite/job/Bar_JR12345?q=1")
    );
    expect(
      contentHash("Intern", "Acme", "https://simplify.jobs/p/b887b47d")
    ).toBe(contentHash("SWE Intern", "Acme", "https://simplify.jobs/p/b887b47d?utm=1"));
  });
});

describe("isUsLocation", () => {
  it("returns true for null location", () => {
    expect(isUsLocation(null)).toBe(true);
  });

  it("returns true for undefined location", () => {
    expect(isUsLocation(undefined)).toBe(true);
  });

  it("returns true for empty location", () => {
    expect(isUsLocation("")).toBe(true);
  });

  it("returns true for US state abbreviation", () => {
    expect(isUsLocation("Mountain View, CA")).toBe(true);
    expect(isUsLocation("New York, NY")).toBe(true);
    expect(isUsLocation("Austin, TX")).toBe(true);
  });

  it("returns true for 'United States'", () => {
    expect(isUsLocation("United States")).toBe(true);
    expect(isUsLocation("Remote, US")).toBe(true);
    expect(isUsLocation("USA")).toBe(true);
  });

  it("returns true for Remote (keep ambiguous)", () => {
    expect(isUsLocation("Remote")).toBe(true);
  });

  it("returns false for non-US countries", () => {
    expect(isUsLocation("London, UK")).toBe(false);
    expect(isUsLocation("Toronto, ON, Canada")).toBe(false);
    expect(isUsLocation("Sydney, Australia")).toBe(false);
    expect(isUsLocation("Berlin, Germany")).toBe(false);
    expect(isUsLocation("Bangalore, India")).toBe(false);
    expect(isUsLocation("Singapore")).toBe(false);
    expect(isUsLocation("Tokyo, Japan")).toBe(false);
    expect(isUsLocation("Home based - EMEA")).toBe(false);
  });

  it("returns false for non-US cities without country", () => {
    expect(isUsLocation("London")).toBe(false);
    expect(isUsLocation("Toronto")).toBe(false);
    expect(isUsLocation("Paris")).toBe(false);
  });

  it("returns true for US cities without state", () => {
    expect(isUsLocation("San Francisco")).toBe(true);
    expect(isUsLocation("New York City")).toBe(true);
  });

  it("returns false for Workday Canada site codes that contain CA", () => {
    expect(
      isUsLocation("CA-NS-HALIFAX-PLANT 41 ~ 189 Pratt & Whitney Dr ~ PLANT 41")
    ).toBe(false);
    expect(isUsLocation("Halifax, NS")).toBe(false);
    expect(isUsLocation("Anaheim, CA, USA")).toBe(true);
    expect(isUsLocation("US-ND-JAMESTOWN-P1")).toBe(true);
  });
});