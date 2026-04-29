import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { WorkoutDetailSheet } from "../WorkoutDetailSheet";

const w = {
  id: "w1",
  plan_id: "p1",
  date: "2026-04-25",
  sport: "run",
  type: "tempo",
  distance_meters: "12000",
  duration_seconds: 3600,
  target_intensity: { pace: { min_seconds_per_km: 240, max_seconds_per_km: 250 }, rpe: 7 },
  intervals: null,
  notes: "Hold steady tempo. Last 2km strong.",
} as never;

describe("WorkoutDetailSheet", () => {
  it("renders nothing when workout is null", () => {
    const { container } = render(
      <WorkoutDetailSheet workout={null} planId="p1" units="mi" onClose={() => {}} />
    );
    expect(container.firstChild).toBeNull();
  });
  it("renders headline + day label + notes when workout provided", () => {
    render(<WorkoutDetailSheet workout={w} planId="p1" units="mi" onClose={() => {}} />);
    expect(screen.getByText("Tempo Run")).toBeInTheDocument();
    expect(screen.getByText(/Saturday, April 25/)).toBeInTheDocument();
    expect(screen.getByText(/Hold steady tempo/)).toBeInTheDocument();
  });
  it("calls onClose when backdrop clicked", () => {
    const onClose = vi.fn();
    render(<WorkoutDetailSheet workout={w} planId="p1" units="mi" onClose={onClose} />);
    fireEvent.click(screen.getByTestId("sheet-backdrop"));
    expect(onClose).toHaveBeenCalled();
  });
  it("links Ask coach to /coach?from=/plans/<id>/<date>", () => {
    render(<WorkoutDetailSheet workout={w} planId="p1" units="mi" onClose={() => {}} />);
    const link = screen.getByRole("link", { name: /Ask coach/ });
    expect(link).toHaveAttribute("href", "/coach?from=%2Fplans%2Fp1%2F2026-04-25");
  });
});
