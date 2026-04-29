# PWA — Home Screen Install

**Date:** 2026-04-29
**Status:** Approved

## Problem

Race Horse is a daily-use coaching app accessed primarily from a phone, but it's only reachable through Safari/Chrome with browser chrome on top. Adding it to the home screen today produces a generic browser bookmark icon that opens in a tab.

## Goal

Tap an icon on the home screen, app opens fullscreen with no browser chrome. Online-only — if the network is down, the user sees the standard browser network error. No service worker, no caching, no offline UX.

## Non-Goals

- Offline support (deferred; revisit only if the broken-offline case bites in practice)
- Push notifications
- App store distribution
- Custom iOS splash screens (`apple-touch-startup-image`)
- Maskable icon variant for Android adaptive icons (deferred; add if Android shows a cropped icon)

## In-Scope Addition (added 2026-04-29 mid-design)

The user produced a new horse-silhouette mark with a matching multi-size favicon as part of the same icon set. Replace the existing emoji favicon (`src/app/icon.svg`) with the new ICO at the same time, since shipping the home-screen icon alongside the old emoji favicon would be visually inconsistent.

---

## Approach

Use Next.js App Router file conventions for everything Next can wire automatically:

- `src/app/manifest.ts` — typed `MetadataRoute.Manifest` route handler. Next serves it at `/manifest.webmanifest` and emits `<link rel="manifest">`.
- `src/app/apple-icon.png` — Next emits `<link rel="apple-touch-icon">`.
- `appleWebApp` key on the existing `metadata` export in `src/app/layout.tsx` for iOS-specific meta tags.

Manifest icons (192/512) live under `public/icons/` and are referenced by URL from `manifest.ts`.

Existing `src/app/icon.svg` stays as the browser favicon — unchanged.

---

## Manifest

```ts
{
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
}
```

Key choices:

- **`start_url: "/"`** — `/` already redirects to `/today` when authed and shows the Strava sign-in when not, so this handles both cases without new logic.
- **`scope: "/"`** — keeps the entire app in standalone; off-app links open in the system browser.
- **`theme_color: #f5f0e8`** — matches `--color-bg-base`. The status bar disappears into the page background. The alternative (a brown branded status bar) was rejected because it visually separates the status bar from cream content on every screen.
- **`background_color: #f5f0e8`** — same cream; shown briefly on Android cold launch behind the icon.
- **`orientation: "portrait"`** — phone coaching app; landscape isn't a designed-for case.

---

## Icons

Three PNGs, all derived from one source design (a horse silhouette). Design at 512 and downscale; do not redraw per size. Bake `#f5f0e8` cream as a solid square background — never ship transparent PNGs (iOS renders transparency as black against the home screen, which looks broken against the cream brand).

| File | Size | Path | Purpose |
|---|---|---|---|
| Apple touch icon | 180×180 | `src/app/apple-icon.png` | iOS home screen — Next auto-wires the `<link>` tag |
| Android/Chrome small | 192×192 | `public/icons/icon-192.png` | manifest `icons[]` — Android home screen, install dialog |
| Android/Chrome large | 512×512 | `public/icons/icon-512.png` | manifest `icons[]` — splash screen, store listings |

The user produces all three using an external image tool.

---

## iOS Meta Tags

Add to the existing `metadata` export in `src/app/layout.tsx`:

```ts
appleWebApp: {
  capable: true,
  title: "Race Horse",
  statusBarStyle: "default",
}
```

- **`capable: true`** — emits `<meta name="apple-mobile-web-app-capable" content="yes">`. Required: without it, iOS opens the app in Safari chrome even when launched from the home screen.
- **`title`** — label under the home-screen icon. Same as manifest `name`.
- **`statusBarStyle: "default"`** — opaque-ish status bar with dark text, content lays out below it. Correct choice for a light/cream app. `black-translucent` was rejected because it overlays white status-bar text on a cream background, which is unreadable.

The existing `viewportFit: "cover"` in the viewport export pairs cleanly with `default`. If a future iteration switches to `black-translucent` for an edge-to-edge look, the header would need `env(safe-area-inset-top)` padding — out of scope for v1.

---

## File Changes

**New files:**
- `src/app/manifest.ts`
- `src/app/apple-icon.png` (180×180, user-provided)
- `public/icons/icon-192.png` (192×192, user-provided)
- `public/icons/icon-512.png` (512×512, user-provided)

**Modified:**
- `src/app/layout.tsx` — add `appleWebApp` to the `metadata` export.
- `src/app/favicon.ico` — replace existing favicon with the new multi-size ICO (16/32/48), user-provided.

**Deleted:**
- `src/app/icon.svg` — emoji favicon, superseded by the new `favicon.ico`. Both files coexisting would have Next emit two `<link rel="icon">` tags and let the browser pick.

**Unchanged:**
- `next.config.ts` — no PWA-related config needed.

---

## Implementation Note

Per `AGENTS.md` ("This is NOT the Next.js you know"), before writing `manifest.ts` the implementer must consult `node_modules/next/dist/docs/` to confirm:

1. The `MetadataRoute.Manifest` shape exported from `"next"` in Next 16.
2. That the `app/manifest.ts` and `app/apple-icon.png` file conventions still auto-wire `<link rel="manifest">` and `<link rel="apple-touch-icon">`.
3. The `appleWebApp` metadata key shape.

If any of these have shifted, fall back to Approach 2 (static `public/manifest.webmanifest` plus explicit `<link>` tags in `layout.tsx`) — same end-state HTML, different wiring.

---

## Acceptance

After build, the served HTML for any page must include:

- `<link rel="manifest" href="/manifest.webmanifest">`
- `<link rel="apple-touch-icon" ...>`
- `<meta name="mobile-web-app-capable" content="yes">` (Next 16 emits the cross-platform name; iOS still honors it)
- `<meta name="apple-mobile-web-app-title" content="Race Horse">`
- `<meta name="apple-mobile-web-app-status-bar-style" content="default">`

Manual device check:

- **iOS Safari:** Share → Add to Home Screen shows the horse icon and "Race Horse" title. Launching from the home screen opens fullscreen with no Safari chrome. Status bar shows dark text on the cream theme color.
- **Android Chrome:** Install prompt appears (or the menu's "Install app" entry is enabled). Installed app launches in standalone with the horse icon. Brief launch splash shows the cream `background_color` behind the 512 icon.
