import { describe, it, expect } from "vitest";
import { metadata } from "../layout";

describe("root metadata", () => {
  it("declares apple web app capability for iOS standalone install", () => {
    expect(metadata.appleWebApp).toEqual({
      capable: true,
      title: "Race Horse",
      statusBarStyle: "default",
    });
  });
});
