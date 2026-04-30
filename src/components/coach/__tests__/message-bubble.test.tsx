import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { MessageBubble } from "../message-bubble";
import { BUILD_FORM_SENTINEL, formatBuildForm } from "@/coach/build-form";
import type { StoredMessage } from "@/coach/types";

function makeMessage(text: string, role: "user" | "assistant" = "user"): StoredMessage {
  return {
    id: "m1",
    role,
    plan_id: null,
    content: [{ type: "text", text }],
    created_at: new Date(),
  };
}

describe("MessageBubble", () => {
  it("renders a normal user bubble for plain text", () => {
    render(<MessageBubble message={makeMessage("hello there")} />);
    expect(screen.getByText("hello there")).toBeInTheDocument();
  });

  it("renders the locked BuildFormCard when the user message contains the build sentinel", () => {
    const md = formatBuildForm({
      sport: "run",
      goal_type: "race",
      race_date: "2026-04-20",
      race_event: "Boston Marathon",
      target_time: "sub-3:00",
      context: "Hilly course",
    });
    render(<MessageBubble message={makeMessage(md)} />);
    expect(screen.getByLabelText(/Plan request/i)).toBeInTheDocument();
    expect(screen.getByText("Boston Marathon")).toBeInTheDocument();
    expect(screen.getByText("sub-3:00")).toBeInTheDocument();
  });

  it("strips the <context> block before checking for sentinel", () => {
    const md = formatBuildForm({ sport: "bike", goal_type: "indefinite" });
    const wrapped = `<context>\nToday: 2026-04-27\n</context>\n\n${md}`;
    render(<MessageBubble message={makeMessage(wrapped)} />);
    expect(screen.getByLabelText(/Plan request/i)).toBeInTheDocument();
  });

  it("falls back to a normal bubble if sentinel exists but parsing fails", () => {
    const corrupted = `${BUILD_FORM_SENTINEL}\nnot really a build form`;
    render(<MessageBubble message={makeMessage(corrupted)} />);
    expect(screen.queryByLabelText(/Plan request/i)).toBeNull();
  });
});
