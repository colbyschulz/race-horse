import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { WorkoutBadge } from "../WorkoutBadge";

describe("WorkoutBadge", () => {
  it("renders the label for each type", () => {
    const types = [
      "easy",
      "long",
      "tempo",
      "threshold",
      "intervals",
      "recovery",
      "race",
      "rest",
      "cross",
    ] as const;
    for (const t of types) {
      const { unmount } = render(<WorkoutBadge type={t} />);
      const label = t.charAt(0).toUpperCase() + t.slice(1);
      expect(screen.getByText(label)).toBeInTheDocument();
      unmount();
    }
  });
  it("respects size prop", () => {
    const { container } = render(<WorkoutBadge type="easy" size="sm" />);
    expect((container.firstChild as HTMLElement).className).toMatch(/sm/);
  });
});
