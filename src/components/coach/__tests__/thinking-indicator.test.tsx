import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act, render, screen } from "@testing-library/react";
import { ThinkingIndicator, formatElapsed } from "../thinking-indicator";

describe("formatElapsed", () => {
  it("shows minutes and two-digit seconds", () => {
    expect(formatElapsed(0)).toBe("0:00");
    expect(formatElapsed(9)).toBe("0:09");
    expect(formatElapsed(75)).toBe("1:15");
    expect(formatElapsed(221)).toBe("3:41");
  });
});

describe("ThinkingIndicator", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-11-11T12:00:00Z"));
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  const tick = (seconds: number) =>
    act(() => {
      vi.advanceTimersByTime(seconds * 1000);
    });

  it("says what the coach is doing and counts up from when the turn began", () => {
    render(<ThinkingIndicator startedAt={Date.now()} />);
    expect(screen.getByRole("status")).toHaveTextContent("Thinking");
    expect(screen.getByText("0:00")).toBeInTheDocument();

    tick(7);
    expect(screen.getByText("0:07")).toBeInTheDocument();
  });

  it("picks up the clock partway through a turn that was already running", () => {
    render(<ThinkingIndicator label="Working" startedAt={Date.now() - 95_000} />);
    expect(screen.getByRole("status")).toHaveTextContent("Working");
    expect(screen.getByText("1:35")).toBeInTheDocument();
  });

  it("adds nothing but the clock to an ordinary turn, however long it runs", () => {
    render(<ThinkingIndicator startedAt={Date.now()} />);
    tick(120);
    expect(screen.getByRole("status")).toHaveTextContent(/^Thinking\s*2:00$/);
  });

  it("sets expectations in one short line for a turn known to be long", () => {
    const { rerender } = render(<ThinkingIndicator startedAt={Date.now()} expectation="plan" />);
    expect(screen.getByText("Writing a full plan takes a few minutes.")).toBeInTheDocument();

    rerender(<ThinkingIndicator startedAt={Date.now()} expectation="deep" />);
    expect(
      screen.getByText("This is a bigger change, so it can take a few minutes.")
    ).toBeInTheDocument();
  });

  it("shows no clock or hint when it doesn't know when the turn began", () => {
    render(<ThinkingIndicator />);
    tick(60);
    expect(screen.getByRole("status")).toHaveTextContent(/^Thinking$/);
  });
});
