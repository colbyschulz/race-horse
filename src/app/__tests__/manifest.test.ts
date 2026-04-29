import { describe, it, expect } from "vitest";
import manifest from "../manifest";

describe("PWA manifest", () => {
  const m = manifest();

  it("identifies as Race Horse", () => {
    expect(m.name).toBe("Race Horse");
    expect(m.short_name).toBe("Race Horse");
    expect(m.description).toBe("Virtual coach for runners and cyclists");
  });

  it("opens in standalone with portrait lock", () => {
    expect(m.display).toBe("standalone");
    expect(m.orientation).toBe("portrait");
  });

  it("uses '/' as start_url and scope so auth redirect handles entry", () => {
    expect(m.start_url).toBe("/");
    expect(m.scope).toBe("/");
  });

  it("uses cream tokens for theme and background", () => {
    expect(m.theme_color).toBe("#f5f0e8");
    expect(m.background_color).toBe("#f5f0e8");
  });

  it("references 192 and 512 PNG icons under /icons", () => {
    expect(m.icons).toEqual([
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
    ]);
  });

  it("declares fitness/health categories", () => {
    expect(m.categories).toEqual(["health", "fitness", "sports"]);
  });
});
