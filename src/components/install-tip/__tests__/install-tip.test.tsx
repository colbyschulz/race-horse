import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { InstallTipView } from "../install-tip";

const IPHONE =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Mobile/15E148 Safari/604.1";
const ANDROID =
  "Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36";
const DESKTOP =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

describe("InstallTipView", () => {
  it("gives the iPhone steps, with no reason attached", () => {
    render(<InstallTipView offer="ios" onInstall={() => {}} />);
    const tip = screen.getByRole("complementary", { name: "Add to Home Screen" });
    expect(tip).toHaveTextContent("To install, tap Share, then Add to Home Screen.");
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("gives the Android browser-menu steps", () => {
    render(<InstallTipView offer="android" onInstall={() => {}} />);
    expect(screen.getByRole("complementary")).toHaveTextContent(
      /open the browser menu.*then tap Add to Home screen\./
    );
  });

  it("offers a button when the browser has its own install dialog", async () => {
    const onInstall = vi.fn();
    render(<InstallTipView offer="prompt" onInstall={onInstall} />);
    await userEvent.click(screen.getByRole("button", { name: "Install" }));
    expect(onInstall).toHaveBeenCalledTimes(1);
  });

  it("shows nothing once installed, or where there is no home screen", () => {
    const { container, rerender } = render(<InstallTipView offer="installed" onInstall={() => {}} />);
    expect(container).toBeEmptyDOMElement();
    rerender(<InstallTipView offer="none" onInstall={() => {}} />);
    expect(container).toBeEmptyDOMElement();
  });
});

describe("InstallTip", () => {
  let standalone = false;

  /** A fresh copy of the module, since it remembers the browser's offer between renders. */
  async function renderTip(userAgent: string) {
    vi.resetModules();
    vi.spyOn(navigator, "userAgent", "get").mockReturnValue(userAgent);
    const { InstallTip } = await import("../install-tip");
    return render(<InstallTip />);
  }

  beforeEach(() => {
    standalone = false;
    vi.stubGlobal(
      "matchMedia",
      vi.fn(() => ({
        matches: standalone,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      }))
    );
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("shows the iPhone steps in a browser tab on an iPhone", async () => {
    await renderTip(IPHONE);
    expect(screen.getByRole("complementary")).toHaveTextContent(/tap Share, then Add to Home Screen/);
  });

  it("shows nothing when the app is already running from the Home Screen", async () => {
    standalone = true;
    const { container } = await renderTip(IPHONE);
    expect(container).toBeEmptyDOMElement();
  });

  it("shows nothing on a desktop browser that hasn't offered to install", async () => {
    const { container } = await renderTip(DESKTOP);
    expect(container).toBeEmptyDOMElement();
  });

  it("switches to an Install button when the browser offers its dialog, and uses the offer once", async () => {
    await renderTip(ANDROID);
    expect(screen.getByRole("complementary")).toHaveTextContent(/open the browser menu/);

    const offer = Object.assign(new Event("beforeinstallprompt"), {
      prompt: vi.fn().mockResolvedValue(undefined),
    });
    act(() => {
      window.dispatchEvent(offer);
    });
    await userEvent.click(await screen.findByRole("button", { name: "Install" }));

    expect(offer.prompt).toHaveBeenCalledTimes(1);
    // The offer is spent, so the tip falls back to the browser's own steps.
    expect(await screen.findByText(/open the browser menu/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Install" })).not.toBeInTheDocument();
  });

  it("disappears once the app has been installed", async () => {
    const { container } = await renderTip(ANDROID);
    act(() => {
      window.dispatchEvent(new Event("appinstalled"));
    });
    expect(container).toBeEmptyDOMElement();
  });
});
