import { describe, it, expect } from "vitest";
import { installPlatform } from "../install";

const IPHONE_SAFARI =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Mobile/15E148 Safari/604.1";
const IPHONE_CHROME =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/131.0.0.0 Mobile/15E148 Safari/604.1";
const MAC_SAFARI =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Safari/605.1.15";
const ANDROID_CHROME =
  "Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36";
const WINDOWS_CHROME =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

describe("installPlatform", () => {
  it("treats an iPhone the same in Safari and Chrome", () => {
    expect(installPlatform(IPHONE_SAFARI, 5)).toBe("ios");
    expect(installPlatform(IPHONE_CHROME, 5)).toBe("ios");
  });

  it("recognises an iPad, which reports itself as a Mac with a touch screen", () => {
    expect(installPlatform(MAC_SAFARI, 5)).toBe("ios");
  });

  it("doesn't mistake a real Mac for an iPad", () => {
    expect(installPlatform(MAC_SAFARI, 0)).toBe("other");
  });

  it("recognises Android", () => {
    expect(installPlatform(ANDROID_CHROME, 5)).toBe("android");
  });

  it("offers nothing device-specific on a desktop", () => {
    expect(installPlatform(WINDOWS_CHROME, 0)).toBe("other");
  });
});
