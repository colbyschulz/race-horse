import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { ContextPill } from "../context-pill";

describe("ContextPill", () => {
  it("links back to the page the athlete came from", () => {
    render(<ContextPill fromRoute="/today" />);
    expect(screen.getByRole("link", { name: "← Back to Today view" })).toHaveAttribute(
      "href",
      "/today"
    );
  });

  it("uses the label it was given", () => {
    render(<ContextPill fromRoute="/plans" fromLabel="Boston build" />);
    expect(screen.getByRole("link", { name: "← Back to Boston build" })).toHaveAttribute(
      "href",
      "/plans"
    );
  });

  it("leads to the plans list when there is no page to go back to", () => {
    render(<ContextPill />);
    expect(screen.getByRole("link", { name: "← Back to Plans" })).toHaveAttribute("href", "/plans");
  });

  it("leads to the plans list when only a label is known", () => {
    render(<ContextPill fromLabel="Boston build" />);
    expect(screen.getByRole("link", { name: "← Back to Plans" })).toHaveAttribute("href", "/plans");
  });

  it("leads to the plans list from a page it has no name for", () => {
    render(<ContextPill fromRoute="/somewhere-else" />);
    expect(screen.getByRole("link", { name: "← Back to Plans" })).toHaveAttribute("href", "/plans");
  });
});
