import { describe, it, expect } from "vitest";
import { BUILD_FORM_SENTINEL, formatBuildForm, parseBuildForm } from "../buildForm";

describe("BUILD_FORM_SENTINEL", () => {
  it("is the documented HTML comment sentinel", () => {
    expect(BUILD_FORM_SENTINEL).toBe("<!-- build_form_request -->");
  });
});

describe("formatBuildForm", () => {
  it("formats a race-targeted build with all optional fields", () => {
    const md = formatBuildForm({
      sport: "run",
      goal_type: "race",
      race_date: "2026-04-20",
      race_event: "Boston Marathon",
      target_time: "sub-3:00",
      context: "Hilly course. No running Sundays.",
    });
    expect(md.startsWith("<!-- build_form_request -->\n")).toBe(true);
    expect(md).toContain("**Build a plan**");
    expect(md).toContain("- **Sport:** Run");
    expect(md).toContain("- **Goal:** Race — Boston Marathon, 2026-04-20");
    expect(md).toContain("- **Target time:** sub-3:00");
    expect(md).toContain("- **Goals & context:** Hilly course. No running Sundays.");
  });

  it("formats an indefinite build with minimal fields", () => {
    const md = formatBuildForm({
      sport: "bike",
      goal_type: "indefinite",
    });
    expect(md.startsWith("<!-- build_form_request -->\n")).toBe(true);
    expect(md).toContain("- **Sport:** Bike");
    expect(md).toContain("- **Goal:** Indefinite build");
    expect(md).not.toContain("**Target time:**");
    expect(md).not.toContain("**Goals & context:**");
  });

  it("omits target_time and context when empty strings", () => {
    const md = formatBuildForm({
      sport: "run",
      goal_type: "race",
      race_date: "2026-09-01",
      race_event: "10K",
      target_time: "",
      context: "",
    });
    expect(md).not.toContain("**Target time:**");
    expect(md).not.toContain("**Goals & context:**");
  });

  it("normalizes newlines in context to spaces", () => {
    const md = formatBuildForm({
      sport: "run",
      goal_type: "indefinite",
      context: "line one\nline two",
    });
    const parsed = parseBuildForm(md);
    expect(parsed?.context).toBe("line one line two");
  });
});

describe("parseBuildForm", () => {
  it("round-trips a fully populated race build", () => {
    const original = {
      sport: "run" as const,
      goal_type: "race" as const,
      race_date: "2026-04-20",
      race_event: "Boston Marathon",
      target_time: "sub-3:00",
      context: "Hilly course. No running Sundays.",
    };
    const parsed = parseBuildForm(formatBuildForm(original));
    expect(parsed).toEqual(original);
  });

  it("round-trips an indefinite build", () => {
    const original = { sport: "bike" as const, goal_type: "indefinite" as const };
    const parsed = parseBuildForm(formatBuildForm(original));
    expect(parsed).toEqual(original);
  });

  it("returns null when sentinel is missing", () => {
    expect(parseBuildForm("just some text")).toBeNull();
    expect(
      parseBuildForm("**Build a plan**\n- **Sport:** Run\n- **Goal:** Indefinite build")
    ).toBeNull();
  });

  it("returns null when required fields are missing", () => {
    expect(
      parseBuildForm("<!-- build_form_request -->\n**Build a plan**\n- **Sport:** Run\n")
    ).toBeNull();
  });

  it("ignores extra leading whitespace before the sentinel", () => {
    const md = `\n\n${formatBuildForm({ sport: "run", goal_type: "indefinite" })}`;
    const parsed = parseBuildForm(md);
    expect(parsed?.sport).toBe("run");
  });

  it("round-trips a race build where the event name contains a comma", () => {
    const original = {
      sport: "run" as const,
      goal_type: "race" as const,
      race_date: "2026-10-12",
      race_event: "Ironman 70.3, Barcelona",
      target_time: undefined,
      context: undefined,
    };
    const parsed = parseBuildForm(formatBuildForm(original));
    expect(parsed).toEqual(original);
  });
});
