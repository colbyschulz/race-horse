import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { ThinkingIndicator } from "../thinking-indicator";

describe("ThinkingIndicator", () => {
  it("says the coach is thinking, with no clock", () => {
    render(<ThinkingIndicator />);
    expect(screen.getByRole("status")).toHaveTextContent(/^Thinking$/);
  });

  it("uses the label it is given", () => {
    render(<ThinkingIndicator label="Working" />);
    expect(screen.getByRole("status")).toHaveTextContent(/^Working$/);
  });

  it("steps aside while a step is on screen saying what's happening", () => {
    render(<ThinkingIndicator stepShowing />);
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("sets expectations in one short line for a turn known to be long", () => {
    const { rerender } = render(<ThinkingIndicator expectation="plan" />);
    expect(screen.getByText("Writing a full plan takes a few minutes.")).toBeInTheDocument();

    rerender(<ThinkingIndicator expectation="deep" />);
    expect(
      screen.getByText("This is a bigger change, so it can take a few minutes.")
    ).toBeInTheDocument();
  });

  it("keeps the expectation showing while a step runs, without the dots or label", () => {
    render(<ThinkingIndicator stepShowing expectation="plan" />);
    expect(screen.getByRole("status")).toHaveTextContent(
      /^Writing a full plan takes a few minutes\.$/
    );
  });
});
