# PWA Home Screen Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Race Horse installable to the iOS/Android home screen, launching fullscreen with no browser chrome. No service worker, no offline support — online-only "icon + standalone" PWA.

**Architecture:** Next.js App Router file conventions. A `src/app/manifest.ts` route handler returns a typed `MetadataRoute.Manifest`. PNG icon assets live under `src/app/apple-icon.png` (180×180) and `public/icons/icon-{192,512}.png`. iOS-specific meta tags are added via the `appleWebApp` key on the existing `metadata` export in `src/app/layout.tsx`. The browser favicon (`src/app/icon.svg`) is unchanged.

**Tech Stack:** Next.js 16.2.4 (App Router), React 19, TypeScript, vitest (jsdom, globals, `@/` alias).

**Spec:** `docs/superpowers/specs/2026-04-29-pwa-home-screen-design.md`

---

## File Structure

| Path | Purpose | Status |
|---|---|---|
| `src/app/manifest.ts` | Route handler returning `MetadataRoute.Manifest`. Next serves at `/manifest.webmanifest`. | Create |
| `src/app/__tests__/manifest.test.ts` | Unit test for manifest shape. | Create |
| `src/app/__tests__/layout.test.ts` | Unit test for root metadata `appleWebApp` shape. | Create |
| `src/app/layout.tsx` | Add `appleWebApp` to existing `metadata` export. | Modify |
| `src/app/apple-icon.png` | 180×180 PNG. Next auto-emits `<link rel="apple-touch-icon">`. | Create (binary, user-supplied) |
| `public/icons/icon-192.png` | 192×192 PNG referenced from manifest. | Create (binary, user-supplied) |
| `public/icons/icon-512.png` | 512×512 PNG referenced from manifest. | Create (binary, user-supplied) |
| `src/app/favicon.ico` | Multi-size ICO (16/32/48). Replaces the existing favicon and supersedes the emoji `icon.svg`. | Replace (binary, user-supplied) |
| `src/app/icon.svg` | Existing emoji favicon — superseded by the new `favicon.ico`. | Delete |

---

## Task 1: Verify Next 16 conventions

Per `AGENTS.md` ("This is NOT the Next.js you know"), confirm three Next.js conventions still hold in the installed Next 16.2.4 before writing code. If any have shifted, surface the deviation in a code review note before continuing.

**Files:**
- Read: `node_modules/next/dist/docs/...` (find the relevant pages via Grep)

- [ ] **Step 1: Locate manifest convention docs**

Run:
```bash
grep -rl "MetadataRoute.Manifest" node_modules/next/dist/docs/ | head
grep -rl "manifest.json\|manifest.webmanifest" node_modules/next/dist/docs/ | head
```
Read the matching files. Confirm: a default-export function from `src/app/manifest.ts` returning `MetadataRoute.Manifest` is auto-served at `/manifest.webmanifest` and a `<link rel="manifest">` tag is auto-emitted into rendered HTML.

- [ ] **Step 2: Locate apple-icon convention docs**

Run:
```bash
grep -rl "apple-icon" node_modules/next/dist/docs/ | head
```
Read the matching files. Confirm: a binary `src/app/apple-icon.png` file is auto-served and a `<link rel="apple-touch-icon">` tag is auto-emitted.

- [ ] **Step 3: Locate appleWebApp metadata docs**

Run:
```bash
grep -rl "appleWebApp\|apple-mobile-web-app" node_modules/next/dist/docs/ | head
```
Read the matching files. Confirm the `appleWebApp` key on the `Metadata` type accepts `{ capable: boolean, title: string, statusBarStyle: "default" | "black" | "black-translucent" }` and emits the corresponding `<meta name="apple-mobile-web-app-*">` tags.

- [ ] **Step 4: Note any deviations**

If all three conventions hold as described, proceed to Task 2 unchanged.

If any convention has shifted, STOP and surface the deviation. The fallback is Approach 2 from the spec (static `public/manifest.webmanifest` plus explicit `<link>` tags in `layout.tsx`) — but that requires re-planning, not silent adaptation.

No commit for this task — it is research only.

---

## Task 2: Add `appleWebApp` to root layout metadata

Adds the iOS-specific meta tags by extending the existing `metadata` export in `src/app/layout.tsx`. TDD against the exported `metadata` object.

**Files:**
- Create: `src/app/__tests__/layout.test.ts`
- Modify: `src/app/layout.tsx`

- [ ] **Step 1: Write the failing test**

Create `src/app/__tests__/layout.test.ts`:

```ts
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
```

- [ ] **Step 2: Run the test to confirm it fails**

Run: `npm test -- src/app/__tests__/layout.test.ts`

Expected: FAIL — `metadata.appleWebApp` is `undefined`.

- [ ] **Step 3: Add `appleWebApp` to the metadata export**

Edit `src/app/layout.tsx`. Replace the existing `metadata` export with:

```ts
export const metadata: Metadata = {
  title: "Race Horse",
  description: "Virtual coach for runners and cyclists",
  appleWebApp: {
    capable: true,
    title: "Race Horse",
    statusBarStyle: "default",
  },
};
```

Leave `viewport`, the `RootLayout` function, and the `globals.scss` import untouched.

- [ ] **Step 4: Run the test to confirm it passes**

Run: `npm test -- src/app/__tests__/layout.test.ts`

Expected: PASS.

- [ ] **Step 5: Run typecheck**

Run: `npx tsc --noEmit`

Expected: no errors. If `appleWebApp` is rejected by the `Metadata` type from `next`, Task 1 step 4 missed a deviation — STOP and re-plan.

- [ ] **Step 6: Commit**

```bash
git add src/app/layout.tsx src/app/__tests__/layout.test.ts
git commit -m "feat(pwa): declare iOS apple-web-app metadata in root layout"
```

---

## Task 3: Create `src/app/manifest.ts` route handler

Creates the Next.js manifest route. TDD against the default-exported function's return value.

**Files:**
- Create: `src/app/__tests__/manifest.test.ts`
- Create: `src/app/manifest.ts`

- [ ] **Step 1: Write the failing test**

Create `src/app/__tests__/manifest.test.ts`:

```ts
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
```

- [ ] **Step 2: Run the test to confirm it fails**

Run: `npm test -- src/app/__tests__/manifest.test.ts`

Expected: FAIL — `Cannot find module '../manifest'`.

- [ ] **Step 3: Implement the manifest**

Create `src/app/manifest.ts`:

```ts
import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Race Horse",
    short_name: "Race Horse",
    description: "Virtual coach for runners and cyclists",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#f5f0e8",
    theme_color: "#f5f0e8",
    categories: ["health", "fitness", "sports"],
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
  };
}
```

- [ ] **Step 4: Run the test to confirm it passes**

Run: `npm test -- src/app/__tests__/manifest.test.ts`

Expected: PASS — all six assertions.

- [ ] **Step 5: Run typecheck**

Run: `npx tsc --noEmit`

Expected: no errors. If `MetadataRoute.Manifest` cannot be imported from `next`, Task 1 missed a deviation.

- [ ] **Step 6: Commit**

```bash
git add src/app/manifest.ts src/app/__tests__/manifest.test.ts
git commit -m "feat(pwa): add web app manifest route"
```

---

## Task 4: Add icon asset files and replace favicon

Drops in the four user-supplied asset files at the exact paths the manifest, Next conventions, and favicon convention expect, and deletes the superseded emoji favicon. Verifies dimensions and formats.

**Files:**
- Create: `src/app/apple-icon.png` (180×180, user-supplied)
- Create: `public/icons/icon-192.png` (192×192, user-supplied)
- Create: `public/icons/icon-512.png` (512×512, user-supplied)
- Replace: `src/app/favicon.ico` (multi-size: 16/32/48, user-supplied)
- Delete: `src/app/icon.svg`

- [ ] **Step 1: Confirm the user has provided all four asset files**

Required:
- `apple-icon.png` at 180×180 with cream `#f5f0e8` baked in.
- `icon-192.png` at 192×192 with cream baked in.
- `icon-512.png` at 512×512 with cream baked in.
- `favicon.ico` containing 16, 32, and 48 sizes.

If any file is missing, STOP and request it.

- [ ] **Step 2: Place the files at the correct paths**

```bash
mkdir -p public/icons
# Copy the user-supplied assets to:
#   src/app/apple-icon.png        (180x180)
#   public/icons/icon-192.png     (192x192)
#   public/icons/icon-512.png     (512x512)
#   src/app/favicon.ico           (replaces the existing favicon)
```

- [ ] **Step 3: Verify dimensions and format**

Run:
```bash
file src/app/apple-icon.png
file public/icons/icon-192.png
file public/icons/icon-512.png
file src/app/favicon.ico
```

Expected output:
```
src/app/apple-icon.png: PNG image data, 180 x 180, ...
public/icons/icon-192.png: PNG image data, 192 x 192, ...
public/icons/icon-512.png: PNG image data, 512 x 512, ...
src/app/favicon.ico: MS Windows icon resource - 3 icons, 16x16, ...
```

The favicon line should report 3 icons covering 16, 32, 48 (exact wording varies by `file` version). If only one size is reported, the user produced a single-size ICO — request a multi-size export.

If any PNG dimension is wrong, STOP and request corrected files. Do not proceed with mismatched assets.

- [ ] **Step 4: Verify no PNG is transparent at corners**

Open each PNG in Preview/an image viewer and visually confirm the cream background `#f5f0e8` is solid to the edges. Transparency renders as black on iOS home screens.

- [ ] **Step 5: Delete the superseded emoji favicon**

Run:
```bash
rm src/app/icon.svg
```

This is required: leaving both files would have Next emit two `<link rel="icon">` tags and let the browser pick — likely the SVG (the old emoji), defeating the favicon update.

- [ ] **Step 6: Commit**

```bash
git add src/app/apple-icon.png public/icons/icon-192.png public/icons/icon-512.png src/app/favicon.ico
git rm src/app/icon.svg
git commit -m "feat(pwa): add home-screen icons and replace emoji favicon"
```

---

## Task 5: End-to-end build verification

Builds the production bundle and verifies the rendered HTML contains the expected PWA tags. This is the spec's primary acceptance check.

**Files:** none modified.

- [ ] **Step 1: Build the production bundle**

Run: `npm run build`

Expected: build completes with no errors. If `manifest.ts` or `apple-icon.png` produce build warnings about size or type, investigate before continuing.

- [ ] **Step 2: Start the production server in the background**

Run:
```bash
npm start &
SERVER_PID=$!
sleep 3
```

- [ ] **Step 3: Curl the homepage and inspect the head tags**

Run:
```bash
curl -s http://localhost:3000 > /tmp/race-horse-home.html
grep -E 'rel="(manifest|apple-touch-icon)"' /tmp/race-horse-home.html
grep -E 'name="(mobile-web-app-capable|apple-mobile-web-app-(title|status-bar-style))"' /tmp/race-horse-home.html
```

Expected output: at least five matching lines covering all of:
- `<link rel="manifest" href="/manifest.webmanifest">`
- `<link rel="apple-touch-icon" ...>` (Next will hash the URL — exact path varies)
- `<meta name="mobile-web-app-capable" content="yes">` (no `apple-` prefix in Next 16 — emitted automatically when `appleWebApp.capable: true`)
- `<meta name="apple-mobile-web-app-title" content="Race Horse">`
- `<meta name="apple-mobile-web-app-status-bar-style" content="default">`

If any are missing, STOP. Inspect Next's auto-emitted tags vs. explicit metadata and reconcile.

- [ ] **Step 4: Curl the manifest endpoint and validate**

Run:
```bash
curl -s http://localhost:3000/manifest.webmanifest | python3 -m json.tool
```

Expected: pretty-printed JSON matching the manifest shape from Task 3 (icons, theme_color, etc.). The `Content-Type` should be `application/manifest+json` — verify with:

```bash
curl -sI http://localhost:3000/manifest.webmanifest | grep -i content-type
```

- [ ] **Step 5: Curl the icon URLs and confirm 200s**

Run:
```bash
curl -sI http://localhost:3000/icons/icon-192.png | head -1
curl -sI http://localhost:3000/icons/icon-512.png | head -1
# apple-icon URL is hashed by Next — extract from the head tag:
grep -oE 'href="[^"]*apple[^"]*"' /tmp/race-horse-home.html
# then curl -sI that URL
```

Expected: `HTTP/1.1 200 OK` for each.

- [ ] **Step 6: Stop the server**

Run: `kill $SERVER_PID`

- [ ] **Step 7: No code changes — no commit needed for this task.**

If anything in steps 3–5 was wrong and required fixes, those fixes should have been committed under the corresponding earlier task (2, 3, or 4), not lumped here.

---

## Task 6: Device install verification (manual)

The build verification proves the HTML is correct, but iOS and Android each have their own install flows that can fail in non-obvious ways (e.g., iOS silently ignores `apple-mobile-web-app-capable` if the meta tag is malformed). Verify on real hardware.

**Files:** none modified.

- [ ] **Step 1: Deploy a test build accessible from the phone**

Either:
- Push to a preview environment if the project has one, or
- Run `npm run dev` and use the LAN IP (e.g. `http://192.168.x.x:3000`) on a phone on the same network. Note: iOS will refuse `Add to Home Screen` for some `http://` origins on newer iOS — if this happens, use a tunneling tool (ngrok, cloudflared) to get a real HTTPS URL.

- [ ] **Step 2: iOS install check**

On an iOS device, open the URL in Safari → Share → Add to Home Screen.

Expected:
- The proposed name is "Race Horse".
- The icon thumbnail shows the horse silhouette on cream.
- After tapping Add, the home-screen icon matches.
- Tapping the home-screen icon launches the app fullscreen — no Safari address bar, no bottom toolbar.
- The status bar shows dark text on a cream-tinted bar (or blends into the cream content).

If the app opens with Safari chrome, the `appleWebApp.capable` meta tag is not being honored — re-check Task 5 step 3 output.

- [ ] **Step 3: Android install check**

On an Android device, open the URL in Chrome.

Expected:
- The browser menu shows "Install app" (or an install prompt appears automatically).
- The installed app icon is the 192/512 PNG.
- Tapping the icon launches the app standalone.
- The brief launch splash shows the cream `background_color` behind the 512 icon.

- [ ] **Step 4: No commit — verification only.**

If a regression is found, file a fix under whichever earlier task introduced the bad output and re-run that task's tests + Task 5 before re-verifying on device.

---

## Self-Review Checklist

Before handing off:

- [x] **Spec coverage:** Every section of the spec maps to a task — manifest fields → Task 3, icons → Task 4, iOS meta tags → Task 2, file layout → Tasks 2–4, acceptance → Tasks 5 & 6.
- [x] **Placeholder scan:** No TBD, "add appropriate error handling," or unwritten test code. All test bodies are complete.
- [x] **Type consistency:** `appleWebApp` shape matches between Task 2's test and implementation. Manifest `icons[]` shape matches between Task 3's test and implementation. Icon paths in Task 3's manifest match Task 4's file placement and Task 5's curl checks (`/icons/icon-192.png`, `/icons/icon-512.png`).
