import { describe, it, expect } from "vitest";
import { metadata } from "../layout";

describe("root metadata", () => {
  it("declares apple web app capability for iOS standalone install", () => {
    expect(metadata.appleWebApp).toEqual({
      capable: true,
      title: "Race Horse",
      statusBarStyle: "default",
      startupImage: [
        {
          url: "/splash/apple-splash-1206x2622.png",
          media:
            "(device-width: 402px) and (device-height: 874px) and (-webkit-device-pixel-ratio: 3) and (orientation: portrait)",
        },
      ],
    });
  });
});
