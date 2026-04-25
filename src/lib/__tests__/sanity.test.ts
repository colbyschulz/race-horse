import { describe, it, expect } from "vitest";

describe("test harness", () => {
  it("can run a passing test", () => {
    expect(1 + 1).toBe(2);
  });
});
