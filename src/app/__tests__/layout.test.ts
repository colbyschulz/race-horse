import { describe, it, expect, vi } from "vitest";

// next/font is resolved by the Next.js compiler, which doesn't run under vitest.
vi.mock("next/font/google", () => ({
  Syne: () => ({ variable: "--font-syne" }),
  Roboto: () => ({ variable: "--font-roboto" }),
}));

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
