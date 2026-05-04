import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { BuildFormCard } from "../build-form-card";

describe("BuildFormCard", () => {
  it("renders editable state with sport and goal toggles", () => {
    render(<BuildFormCard state={{ kind: "editable" }} onSubmit={vi.fn()} onCancel={vi.fn()} />);
    expect(screen.getByRole("button", { name: "Run" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Bike" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Race-targeted" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Indefinite build" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /build plan/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /cancel/i })).toBeInTheDocument();
  });

  it("hides race fields until goal type is race-targeted", () => {
    render(<BuildFormCard state={{ kind: "editable" }} onSubmit={vi.fn()} onCancel={vi.fn()} />);
    expect(screen.queryByRole("button", { name: /select a date/i })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Race-targeted" }));
    expect(screen.getByRole("button", { name: /select a date/i })).toBeInTheDocument();
    expect(screen.getByLabelText(/Race \/ event/i)).toBeInTheDocument();
  });

  it("calls onSubmit with the form values when valid", () => {
    const onSubmit = vi.fn();
    render(<BuildFormCard state={{ kind: "editable" }} onSubmit={onSubmit} onCancel={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "Run" }));
    fireEvent.click(screen.getByRole("button", { name: "Indefinite build" }));
    fireEvent.change(screen.getByLabelText(/Goals & context/i), {
      target: { value: "off-season fitness" },
    });
    fireEvent.click(screen.getByRole("button", { name: /build plan/i }));
    expect(onSubmit).toHaveBeenCalledWith({
      sport: "run",
      goal_type: "indefinite",
      race_date: undefined,
      race_event: undefined,
      target_time: undefined,
      context: "off-season fitness",
    });
  });

  it("requires race_date and race_event when race-targeted", () => {
    const onSubmit = vi.fn();
    render(<BuildFormCard state={{ kind: "editable" }} onSubmit={onSubmit} onCancel={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "Run" }));
    fireEvent.click(screen.getByRole("button", { name: "Race-targeted" }));
    fireEvent.click(screen.getByRole("button", { name: /build plan/i }));
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("renders submitting state with spinner text and disabled fields", () => {
    render(
      <BuildFormCard
        state={{
          kind: "submitting",
          values: { sport: "run", goal_type: "indefinite" },
        }}
        onSubmit={vi.fn()}
        onCancel={vi.fn()}
      />
    );
    expect(screen.getByText(/loading your training history/i)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /build plan/i })).toBeNull();
  });

  it("renders locked state with submitted values and no spinner", () => {
    render(
      <BuildFormCard
        state={{
          kind: "locked",
          values: {
            sport: "run",
            goal_type: "race",
            race_date: "2026-04-20",
            race_event: "Boston Marathon",
            target_time: "sub-3:00",
            context: "Hilly course",
          },
        }}
        onSubmit={vi.fn()}
        onCancel={vi.fn()}
      />
    );
    expect(screen.queryByText(/loading your training history/i)).toBeNull();
    expect(screen.getByText("Boston Marathon")).toBeInTheDocument();
    expect(screen.getByText("sub-3:00")).toBeInTheDocument();
    expect(screen.getByText(/Hilly course/)).toBeInTheDocument();
  });
});
