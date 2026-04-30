import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { ActivityRow } from "../activity-row";

const activity = {
  id: "a-1",
  userId: "u-1",
  strava_id: 123456789,
  name: "Morning Run",
  type: "Run",
  start_date: new Date("2026-04-25T13:00:00Z"),
  distance_meters: "12701.6",
  moving_time_seconds: 3462,
  elapsed_time_seconds: 3500,
  avg_hr: "148",
  max_hr: "162",
  avg_pace_seconds_per_km: "270",
  avg_power_watts: null,
  elevation_gain_m: "80",
  matched_workout_id: null,
  raw: {},
  created_at: new Date(),
  updated_at: new Date(),
} as never;

describe("ActivityRow", () => {
  it("renders the activity name", () => {
    render(<ActivityRow activity={activity} units="mi" />);
    expect(screen.getByText("Morning Run")).toBeInTheDocument();
  });
  it("links to strava.com/activities/<id> in a new tab", () => {
    render(<ActivityRow activity={activity} units="mi" />);
    const link = screen.getByRole("link", { name: /Morning Run/ });
    expect(link).toHaveAttribute("href", "https://www.strava.com/activities/123456789");
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("rel", expect.stringContaining("noopener"));
  });
  it("formats distance in mi when units=mi", () => {
    render(<ActivityRow activity={activity} units="mi" />);
    expect(screen.getByText(/7\.[89]/)).toBeInTheDocument();
  });
  it("formats distance in km when units=km", () => {
    render(<ActivityRow activity={activity} units="km" />);
    expect(screen.getByText(/12\.7/)).toBeInTheDocument();
  });
});
