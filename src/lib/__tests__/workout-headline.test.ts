import { describe, it, expect } from "vitest";
import { hasSportIcon, workoutHeadline } from "../workout-headline";

describe("workoutHeadline", () => {
  it("names runs as runs", () => {
    expect(workoutHeadline("easy", "run")).toBe("Easy Run");
    expect(workoutHeadline("intervals", "run")).toBe("Intervals");
  });
  it("names bike sessions as rides", () => {
    expect(workoutHeadline("easy", "bike")).toBe("Easy Ride");
    expect(workoutHeadline("long", "bike")).toBe("Long Ride");
    expect(workoutHeadline("intervals", "bike")).toBe("Interval Ride");
  });
  it("keeps sport-neutral types the same for both", () => {
    expect(workoutHeadline("race", "bike")).toBe("Race Day");
  });
  it("falls back to the raw type for one it doesn't know", () => {
    expect(workoutHeadline("hike", "run")).toBe("hike");
  });
});

describe("hasSportIcon", () => {
  it("is off for rest days only", () => {
    expect(hasSportIcon("rest")).toBe(false);
    expect(hasSportIcon("easy")).toBe(true);
  });
});
