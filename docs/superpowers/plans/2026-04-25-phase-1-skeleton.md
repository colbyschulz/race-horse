# Phase 1: Skeleton — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Land a deployable Next.js app skeleton with Strava-only auth, an empty navigation shell, and per-user preferences capture (units + timezone). Phase 2 builds Strava activity sync on top of this foundation.

**Architecture:** Next.js 15 App Router on Vercel. NextAuth v5 (Auth.js) with a custom Strava OAuth provider, persisted to Neon Postgres via Drizzle ORM (`@auth/drizzle-adapter`). The app surface is a mobile-first bottom tab bar (sidebar on desktop) with empty placeholder pages for Today / Calendar / Plans, plus a floating "Ask coach" button that opens a "coming soon" modal. On first sign-in, a client component captures the browser's IANA timezone and persists default preferences via an authed POST.

**Tech Stack:**
- Next.js 15 (App Router) + React 19 + TypeScript
- SCSS Modules + Radix UI Primitives
- NextAuth v5 (`next-auth` package, v5+) + custom Strava provider
- `@auth/drizzle-adapter`
- Drizzle ORM + `drizzle-kit` + Neon Postgres (`@neondatabase/serverless`)
- Vitest + `@testing-library/react` + jsdom
- pnpm

---

## External setup (manual — do these BEFORE starting Task 1)

These create resources Claude can't create itself. Provide the resulting credentials to `.env.local` after Task 4.

1. **Strava developer app**
   - Go to https://www.strava.com/settings/api
   - Create an application: name `colbystrainingplan (dev)`, website `http://localhost:3000`, **Authorization Callback Domain: `localhost`**
   - Copy `Client ID` and `Client Secret` — you'll paste these into `.env.local`
   - Note: a separate Strava app will be needed for production later (Phase 2)

2. **Neon database**
   - Go to https://console.neon.tech and create a project (region close to you)
   - Name the database `colbystrainingplan`
   - Copy the **pooled** connection string — looks like `postgres://user:pass@ep-xxx-pooler.region.aws.neon.tech/colbystrainingplan?sslmode=require`

3. **NextAuth secret**
   - Generate one: `openssl rand -hex 32`
   - You'll paste this into `.env.local` as `AUTH_SECRET`

Keep these three values handy — you'll need them in Task 4.

---

## Task 1: Bootstrap Next.js project

**Files:**
- Create: `package.json`, `tsconfig.json`, `next.config.ts`, `src/app/layout.tsx`, `src/app/page.tsx`, `src/styles/globals.scss`, `src/styles/tokens.scss`, `pnpm-lock.yaml`, `next-env.d.ts`, `eslint.config.mjs`, `postcss.config.mjs`

- [ ] **Step 1: Initialize Next.js with the right flags**

The repo already has `.git` and `.gitignore`. Run `create-next-app` into the existing directory using `pnpm`. We're using SCSS Modules, so skip Tailwind. We want TypeScript, ESLint, App Router, `src/` directory, and the `@/*` import alias.

```bash
pnpm dlx create-next-app@latest . \
  --typescript \
  --eslint \
  --app \
  --src-dir \
  --import-alias '@/*' \
  --no-tailwind \
  --use-pnpm \
  --turbopack \
  --skip-install \
  --yes
```

Expected: files generated. The CLI will warn that the directory isn't empty; press `y` to continue if prompted (the `--yes` flag should answer this).

- [ ] **Step 2: Replace the default Tailwind-free CSS with SCSS**

`create-next-app --no-tailwind` produces `src/app/globals.css`. Replace with `globals.scss` so we have SCSS from day one.

```bash
rm src/app/globals.css
mkdir -p src/styles
```

Create `src/styles/tokens.scss`:

```scss
// Design tokens. Expand as the design system grows.
:root {
  --color-bg: #ffffff;
  --color-fg: #0a0a0a;
  --color-muted: #6b7280;
  --color-border: #e5e7eb;
  --color-accent: #fc4c02; // Strava orange — provisional

  --space-1: 0.25rem;
  --space-2: 0.5rem;
  --space-3: 0.75rem;
  --space-4: 1rem;
  --space-6: 1.5rem;
  --space-8: 2rem;

  --radius-sm: 4px;
  --radius-md: 8px;
  --radius-lg: 12px;

  --font-sans: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;

  --shell-tabbar-height: 56px;
  --shell-sidebar-width: 240px;
}

@media (prefers-color-scheme: dark) {
  :root {
    --color-bg: #0a0a0a;
    --color-fg: #f5f5f5;
    --color-muted: #9ca3af;
    --color-border: #262626;
  }
}
```

Create `src/styles/globals.scss`:

```scss
@use "./tokens.scss";

*, *::before, *::after {
  box-sizing: border-box;
}

html, body {
  margin: 0;
  padding: 0;
  font-family: var(--font-sans);
  background: var(--color-bg);
  color: var(--color-fg);
  -webkit-font-smoothing: antialiased;
}

a {
  color: inherit;
  text-decoration: none;
}

button {
  font: inherit;
  cursor: pointer;
}
```

- [ ] **Step 3: Update `src/app/layout.tsx` to use the SCSS file**

```tsx
import type { Metadata } from "next";
import "@/styles/globals.scss";

export const metadata: Metadata = {
  title: "colbystrainingplan",
  description: "Virtual coach for runners and cyclists",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
```

- [ ] **Step 4: Replace the default landing page with a minimal placeholder**

`src/app/page.tsx`:

```tsx
export default function HomePage() {
  return (
    <main style={{ padding: "var(--space-8)" }}>
      <h1>colbystrainingplan</h1>
      <p>Skeleton booted.</p>
    </main>
  );
}
```

- [ ] **Step 5: Install deps and verify the dev server boots**

```bash
pnpm install
pnpm dev
```

Expected: server starts at `http://localhost:3000`, no errors. Open the page and confirm "Skeleton booted." is visible. Then `Ctrl-C` to stop.

- [ ] **Step 6: Commit**

```bash
git add .
git commit -m "Bootstrap Next.js 15 app with TypeScript + SCSS"
```

---

## Task 2: Add Vitest test harness

**Files:**
- Create: `vitest.config.ts`, `vitest.setup.ts`, `src/lib/__tests__/sanity.test.ts`
- Modify: `package.json` (add scripts + dev deps)

- [ ] **Step 1: Install Vitest, Testing Library, and jsdom**

```bash
pnpm add -D vitest @vitejs/plugin-react jsdom @testing-library/react @testing-library/jest-dom @testing-library/user-event
```

- [ ] **Step 2: Create `vitest.config.ts`**

```ts
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "node:path";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  test: {
    environment: "jsdom",
    setupFiles: ["./vitest.setup.ts"],
    globals: true,
    css: true,
  },
});
```

- [ ] **Step 3: Create `vitest.setup.ts`**

```ts
import "@testing-library/jest-dom/vitest";
```

- [ ] **Step 4: Add scripts to `package.json`**

In `package.json`, add to the `scripts` object:

```json
"test": "vitest run",
"test:watch": "vitest"
```

- [ ] **Step 5: Write a sanity test to confirm the harness runs**

`src/lib/__tests__/sanity.test.ts`:

```ts
import { describe, it, expect } from "vitest";

describe("test harness", () => {
  it("can run a passing test", () => {
    expect(1 + 1).toBe(2);
  });
});
```

- [ ] **Step 6: Run the tests**

```bash
pnpm test
```

Expected: 1 test passes. If it fails, fix before continuing.

- [ ] **Step 7: Commit**

```bash
git add .
git commit -m "Add Vitest + Testing Library test harness"
```

---

## Task 3: Configure environment variables

**Files:**
- Create: `.env.example`, `.env.local`
- Modify: `.gitignore` (already excludes `.env*`)

- [ ] **Step 1: Create `.env.example` (committed — template for collaborators)**

```
# Database
DATABASE_URL="postgres://user:pass@host/db?sslmode=require"

# NextAuth
AUTH_SECRET=""
AUTH_URL="http://localhost:3000"

# Strava OAuth
AUTH_STRAVA_ID=""
AUTH_STRAVA_SECRET=""
```

- [ ] **Step 2: Create `.env.local` with real values (NOT committed — gitignored)**

Paste the values from the External Setup section:

```
DATABASE_URL="<your Neon pooled connection string>"
AUTH_SECRET="<output of `openssl rand -hex 32`>"
AUTH_URL="http://localhost:3000"
AUTH_STRAVA_ID="<your Strava Client ID>"
AUTH_STRAVA_SECRET="<your Strava Client Secret>"
```

- [ ] **Step 3: Verify `.env.local` is gitignored**

```bash
git status
```

Expected: `.env.local` does NOT appear in the output (it's covered by the existing `.env*` rule). `.env.example` SHOULD appear as new.

- [ ] **Step 4: Commit**

```bash
git add .env.example
git commit -m "Add environment variable template"
```

---

## Task 4: Set up Drizzle + Neon connection

**Files:**
- Create: `src/db/index.ts`, `drizzle.config.ts`
- Modify: `package.json` (add deps + scripts)

- [ ] **Step 1: Install Drizzle, drizzle-kit, and the Neon serverless driver**

```bash
pnpm add drizzle-orm @neondatabase/serverless
pnpm add -D drizzle-kit
```

- [ ] **Step 2: Create `src/db/index.ts`**

```ts
import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import * as schema from "./schema";

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is not set");
}

const sql = neon(process.env.DATABASE_URL);
export const db = drizzle(sql, { schema });
```

This file imports from `./schema` which we'll create in Task 5. It's OK that it doesn't compile yet — the next task fills it in.

- [ ] **Step 3: Create `drizzle.config.ts`**

```ts
import { defineConfig } from "drizzle-kit";

export default defineConfig({
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL!,
  },
  verbose: true,
  strict: true,
});
```

- [ ] **Step 4: Add Drizzle scripts to `package.json`**

In the `scripts` object:

```json
"db:generate": "drizzle-kit generate",
"db:migrate": "drizzle-kit migrate",
"db:push": "drizzle-kit push",
"db:studio": "drizzle-kit studio"
```

- [ ] **Step 5: Commit**

```bash
git add .
git commit -m "Wire up Drizzle ORM + Neon serverless driver"
```

---

## Task 5: Define database schema (NextAuth tables + user preferences)

**Files:**
- Create: `src/db/schema.ts`, `src/db/__tests__/schema.test.ts`

- [ ] **Step 1: Install the auth adapter**

```bash
pnpm add @auth/drizzle-adapter
```

- [ ] **Step 2: Write the failing schema test**

`src/db/__tests__/schema.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { users, accounts, sessions, verificationTokens } from "../schema";
import { getTableConfig } from "drizzle-orm/pg-core";

describe("schema", () => {
  it("defines NextAuth tables required by the Drizzle adapter", () => {
    expect(getTableConfig(users).name).toBe("user");
    expect(getTableConfig(accounts).name).toBe("account");
    expect(getTableConfig(sessions).name).toBe("session");
    expect(getTableConfig(verificationTokens).name).toBe("verificationToken");
  });

  it("user table has a preferences jsonb column", () => {
    const cols = getTableConfig(users).columns;
    const prefs = cols.find((c) => c.name === "preferences");
    expect(prefs).toBeDefined();
    expect(prefs?.dataType).toBe("json");
  });

  it("user.preferences default includes mi units and a timezone fallback", () => {
    const cols = getTableConfig(users).columns;
    const prefs = cols.find((c) => c.name === "preferences");
    // Drizzle stores the default value internally — sanity check the shape.
    expect(prefs?.hasDefault).toBe(true);
  });
});
```

- [ ] **Step 3: Run the test, expect failure**

```bash
pnpm test
```

Expected: FAILS with "Cannot find module '../schema'".

- [ ] **Step 4: Implement `src/db/schema.ts`**

```ts
import {
  pgTable,
  text,
  timestamp,
  primaryKey,
  integer,
  jsonb,
  uuid,
} from "drizzle-orm/pg-core";
import type { AdapterAccountType } from "next-auth/adapters";

export type UserPreferences = {
  units: "mi" | "km";
  timezone: string;          // IANA, e.g. "America/Los_Angeles"
  pace_format: "min_per_mi" | "min_per_km";
  power_units: "watts";
};

export const DEFAULT_PREFERENCES: UserPreferences = {
  units: "mi",
  timezone: "UTC",
  pace_format: "min_per_mi",
  power_units: "watts",
};

// NextAuth Drizzle adapter expects these names exactly.
export const users = pgTable("user", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name"),
  email: text("email").unique(),
  emailVerified: timestamp("emailVerified", { mode: "date" }),
  image: text("image"),
  preferences: jsonb("preferences")
    .$type<UserPreferences>()
    .default(DEFAULT_PREFERENCES)
    .notNull(),
});

export const accounts = pgTable(
  "account",
  {
    userId: uuid("userId")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    type: text("type").$type<AdapterAccountType>().notNull(),
    provider: text("provider").notNull(),
    providerAccountId: text("providerAccountId").notNull(),
    refresh_token: text("refresh_token"),
    access_token: text("access_token"),
    expires_at: integer("expires_at"),
    token_type: text("token_type"),
    scope: text("scope"),
    id_token: text("id_token"),
    session_state: text("session_state"),
  },
  (account) => [
    primaryKey({
      columns: [account.provider, account.providerAccountId],
    }),
  ],
);

export const sessions = pgTable("session", {
  sessionToken: text("sessionToken").primaryKey(),
  userId: uuid("userId")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  expires: timestamp("expires", { mode: "date" }).notNull(),
});

export const verificationTokens = pgTable(
  "verificationToken",
  {
    identifier: text("identifier").notNull(),
    token: text("token").notNull(),
    expires: timestamp("expires", { mode: "date" }).notNull(),
  },
  (vt) => [primaryKey({ columns: [vt.identifier, vt.token] })],
);
```

- [ ] **Step 5: Run the test, expect pass**

```bash
pnpm test
```

Expected: all 3 tests pass.

- [ ] **Step 6: Commit**

```bash
git add .
git commit -m "Define NextAuth schema with user preferences extension"
```

---

## Task 6: Generate and apply the initial migration

**Files:**
- Create: `drizzle/0000_*.sql` (auto-generated)

- [ ] **Step 1: Generate the migration SQL**

```bash
pnpm db:generate
```

Expected: a file appears under `drizzle/0000_*.sql` containing `CREATE TABLE` statements for `user`, `account`, `session`, `verificationToken`.

- [ ] **Step 2: Apply the migration to Neon**

```bash
pnpm db:migrate
```

Expected: output reports `applied: 1 migration`. If it errors with `DATABASE_URL is not set`, confirm `.env.local` is in the repo root and your shell is in that directory. (Drizzle picks up `.env.local` via Next.js conventions; if needed, run `pnpm dlx dotenv-cli -e .env.local pnpm db:migrate`.)

- [ ] **Step 3: Verify in Drizzle Studio**

```bash
pnpm db:studio
```

Open the URL it prints. Confirm the four tables exist. Stop with `Ctrl-C`.

- [ ] **Step 4: Commit**

```bash
git add drizzle/
git commit -m "Initial migration: NextAuth tables + user preferences"
```

---

## Task 7: Configure NextAuth with custom Strava OAuth provider

**Files:**
- Create: `src/auth/strava.ts`, `src/auth/index.ts`, `src/auth/config.ts`, `src/types/next-auth.d.ts`, `src/app/api/auth/[...nextauth]/route.ts`, `src/middleware.ts`

- [ ] **Step 1: Install NextAuth v5**

```bash
pnpm add next-auth@beta
```

(Despite the `@beta` tag, NextAuth v5 is the stable channel for the Auth.js rewrite — there is no non-beta v5 release yet.)

- [ ] **Step 2: Create the custom Strava provider**

`src/auth/strava.ts`:

```ts
import type { OAuthConfig, OAuthUserConfig } from "next-auth/providers";

interface StravaProfile {
  id: number;
  firstname: string;
  lastname: string;
  profile: string;     // avatar URL
  username?: string;
}

export default function Strava<P extends StravaProfile>(
  options: OAuthUserConfig<P>,
): OAuthConfig<P> {
  return {
    id: "strava",
    name: "Strava",
    type: "oauth",
    authorization: {
      url: "https://www.strava.com/oauth/authorize",
      params: {
        scope: "read,activity:read_all",
        approval_prompt: "auto",
        response_type: "code",
      },
    },
    token: "https://www.strava.com/api/v3/oauth/token",
    userinfo: "https://www.strava.com/api/v3/athlete",
    profile(profile) {
      return {
        id: String(profile.id),
        name: `${profile.firstname} ${profile.lastname}`.trim(),
        // Strava OAuth never returns email — leave undefined.
        email: null,
        image: profile.profile,
      };
    },
    style: { brandColor: "#fc4c02" },
    options,
  };
}
```

- [ ] **Step 3: Create the edge-safe auth config**

`src/auth/config.ts`:

```ts
import type { NextAuthConfig } from "next-auth";
import Strava from "./strava";

// Edge-safe config. Used by middleware. Does NOT import the DB adapter
// (Neon HTTP driver isn't compatible with the edge runtime).
export const authConfig = {
  providers: [
    Strava({
      clientId: process.env.AUTH_STRAVA_ID,
      clientSecret: process.env.AUTH_STRAVA_SECRET,
    }),
  ],
  pages: {
    signIn: "/",
  },
  callbacks: {
    authorized({ auth, request }) {
      const isLoggedIn = !!auth?.user;
      const path = request.nextUrl.pathname;
      const isAppRoute =
        path.startsWith("/today") ||
        path.startsWith("/calendar") ||
        path.startsWith("/plans") ||
        path.startsWith("/coach") ||
        path.startsWith("/settings");
      if (isAppRoute && !isLoggedIn) return false;
      return true;
    },
  },
} satisfies NextAuthConfig;
```

- [ ] **Step 4: Create the full auth setup**

`src/auth/index.ts`:

```ts
import NextAuth from "next-auth";
import { DrizzleAdapter } from "@auth/drizzle-adapter";
import { db } from "@/db";
import { users, DEFAULT_PREFERENCES } from "@/db/schema";
import { eq } from "drizzle-orm";
import { authConfig } from "./config";

export const { handlers, signIn, signOut, auth } = NextAuth({
  ...authConfig,
  adapter: DrizzleAdapter(db),
  session: { strategy: "database" },
  callbacks: {
    ...authConfig.callbacks,
    async session({ session, user }) {
      // Adapter populates session.user from the `user` row, but typed
      // additions like `preferences` need to be fetched explicitly.
      const [row] = await db
        .select({ preferences: users.preferences })
        .from(users)
        .where(eq(users.id, user.id))
        .limit(1);
      session.user.id = user.id;
      session.user.preferences = row?.preferences ?? DEFAULT_PREFERENCES;
      return session;
    },
  },
});
```

- [ ] **Step 5: Augment NextAuth's session/user types**

`src/types/next-auth.d.ts`:

```ts
import type { UserPreferences } from "@/db/schema";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      name?: string | null;
      image?: string | null;
      preferences: UserPreferences;
    };
  }
}
```

- [ ] **Step 6: Wire up the route handler**

`src/app/api/auth/[...nextauth]/route.ts`:

```ts
import { handlers } from "@/auth";
export const { GET, POST } = handlers;
```

- [ ] **Step 7: Wire up middleware**

`src/middleware.ts`:

```ts
import NextAuth from "next-auth";
import { authConfig } from "@/auth/config";

export const { auth: middleware } = NextAuth(authConfig);

export const config = {
  // Apply to all routes except static assets, _next, favicon, and the auth API.
  matcher: ["/((?!api/auth|_next/static|_next/image|favicon.ico).*)"],
};
```

- [ ] **Step 8: Sanity-check the build**

```bash
pnpm build
```

Expected: build succeeds. If you see "Can't resolve 'next-auth/providers'" or similar, double-check the import path in `src/auth/strava.ts`.

- [ ] **Step 9: Commit**

```bash
git add .
git commit -m "Configure NextAuth v5 with custom Strava provider"
```

---

## Task 8: Implement the landing page with "Sign in with Strava"

**Files:**
- Modify: `src/app/page.tsx`
- Create: `src/app/page.module.scss`, `src/app/_actions/sign-in.ts`

- [ ] **Step 1: Create the server action for sign-in**

`src/app/_actions/sign-in.ts`:

```ts
"use server";

import { signIn } from "@/auth";

export async function signInWithStrava() {
  await signIn("strava", { redirectTo: "/today" });
}
```

- [ ] **Step 2: Create the landing page styles**

`src/app/page.module.scss`:

```scss
.main {
  min-height: 100vh;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: var(--space-8);
  text-align: center;
}

.title {
  font-size: 2.5rem;
  margin: 0 0 var(--space-2);
}

.tagline {
  color: var(--color-muted);
  margin: 0 0 var(--space-8);
  max-width: 32rem;
}

.button {
  background: var(--color-accent);
  color: #ffffff;
  border: none;
  border-radius: var(--radius-md);
  padding: var(--space-3) var(--space-6);
  font-weight: 600;
  font-size: 1rem;
  transition: filter 120ms ease;

  &:hover {
    filter: brightness(0.95);
  }
}
```

- [ ] **Step 3: Replace `src/app/page.tsx` with the real landing page**

```tsx
import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { signInWithStrava } from "./_actions/sign-in";
import styles from "./page.module.scss";

export default async function HomePage() {
  const session = await auth();
  if (session?.user) redirect("/today");

  return (
    <main className={styles.main}>
      <h1 className={styles.title}>colbystrainingplan</h1>
      <p className={styles.tagline}>
        A virtual running and cycling coach for athletes who already think in
        pace zones, FTP, and threshold.
      </p>
      <form action={signInWithStrava}>
        <button type="submit" className={styles.button}>
          Sign in with Strava
        </button>
      </form>
    </main>
  );
}
```

- [ ] **Step 4: Test it manually**

```bash
pnpm dev
```

Open `http://localhost:3000`. Click "Sign in with Strava". You should be redirected to Strava's authorization page. Approve the app. You should land on `/today` (which will 404 for now — that's OK, we add it next task).

If you see an OAuth error, double-check `AUTH_STRAVA_ID`, `AUTH_STRAVA_SECRET`, and that the **Authorization Callback Domain** in your Strava app is `localhost`.

Verify in Drizzle Studio (`pnpm db:studio`) that a row exists in `user` and `account`.

`Ctrl-C` to stop.

- [ ] **Step 5: Commit**

```bash
git add .
git commit -m "Add landing page with Strava sign-in"
```

---

## Task 9: Build the authenticated app shell (sidebar + bottom tabs)

**Files:**
- Create: `src/app/(app)/layout.tsx`, `src/components/layout/AppShell.tsx`, `src/components/layout/AppShell.module.scss`, `src/components/layout/NavLinks.tsx`

- [ ] **Step 1: Create the navigation links component**

`src/components/layout/NavLinks.tsx`:

```tsx
"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import styles from "./AppShell.module.scss";

const LINKS = [
  { href: "/today", label: "Today" },
  { href: "/calendar", label: "Calendar" },
  { href: "/plans", label: "Plans" },
] as const;

export function NavLinks({ variant }: { variant: "tabs" | "sidebar" }) {
  const pathname = usePathname();
  return (
    <nav className={variant === "tabs" ? styles.tabs : styles.sidebarNav}>
      {LINKS.map((link) => {
        const active = pathname.startsWith(link.href);
        return (
          <Link
            key={link.href}
            href={link.href}
            className={active ? styles.linkActive : styles.link}
          >
            {link.label}
          </Link>
        );
      })}
    </nav>
  );
}
```

- [ ] **Step 2: Create the AppShell styles**

`src/components/layout/AppShell.module.scss`:

```scss
.shell {
  min-height: 100vh;
  display: flex;
}

.sidebar {
  display: none;
}

.main {
  flex: 1;
  padding: var(--space-6);
  padding-bottom: calc(var(--shell-tabbar-height) + var(--space-6));
}

.tabs {
  position: fixed;
  left: 0;
  right: 0;
  bottom: 0;
  height: var(--shell-tabbar-height);
  display: flex;
  background: var(--color-bg);
  border-top: 1px solid var(--color-border);
}

.sidebarNav {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}

.link,
.linkActive {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 0.875rem;
  font-weight: 500;
  color: var(--color-muted);
  padding: var(--space-3);
}

.linkActive {
  color: var(--color-fg);
}

@media (min-width: 768px) {
  .sidebar {
    display: flex;
    flex-direction: column;
    width: var(--shell-sidebar-width);
    padding: var(--space-6);
    border-right: 1px solid var(--color-border);
    gap: var(--space-6);
  }

  .main {
    padding-bottom: var(--space-6);
  }

  .tabs {
    display: none;
  }

  .sidebarNav .link,
  .sidebarNav .linkActive {
    justify-content: flex-start;
    padding: var(--space-3) var(--space-4);
    border-radius: var(--radius-md);
  }

  .sidebarNav .linkActive {
    background: var(--color-border);
  }
}

.brand {
  font-weight: 700;
  font-size: 1.125rem;
}
```

- [ ] **Step 3: Create the AppShell server component**

`src/components/layout/AppShell.tsx`:

```tsx
import { NavLinks } from "./NavLinks";
import styles from "./AppShell.module.scss";

export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <div className={styles.shell}>
      <aside className={styles.sidebar}>
        <div className={styles.brand}>colbystrainingplan</div>
        <NavLinks variant="sidebar" />
      </aside>
      <main className={styles.main}>{children}</main>
      <div className={styles.tabs}>
        <NavLinks variant="tabs" />
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Create the authenticated route group layout**

`src/app/(app)/layout.tsx`:

```tsx
import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { AppShell } from "@/components/layout/AppShell";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();
  if (!session?.user) redirect("/");

  return <AppShell>{children}</AppShell>;
}
```

- [ ] **Step 5: Commit**

```bash
git add .
git commit -m "Add authenticated AppShell with sidebar + bottom tabs"
```

---

## Task 10: Add placeholder pages for Today / Calendar / Plans / Coach / Settings

**Files:**
- Create: `src/app/(app)/today/page.tsx`, `src/app/(app)/calendar/page.tsx`, `src/app/(app)/plans/page.tsx`, `src/app/(app)/coach/page.tsx`, `src/app/(app)/settings/page.tsx`, `src/components/EmptyState.tsx`, `src/components/EmptyState.module.scss`

- [ ] **Step 1: Create the EmptyState component**

`src/components/EmptyState.module.scss`:

```scss
.root {
  border: 1px dashed var(--color-border);
  border-radius: var(--radius-lg);
  padding: var(--space-8);
  text-align: center;
  color: var(--color-muted);
}

.title {
  font-size: 1.25rem;
  font-weight: 600;
  color: var(--color-fg);
  margin: 0 0 var(--space-2);
}

.body {
  margin: 0;
}
```

`src/components/EmptyState.tsx`:

```tsx
import styles from "./EmptyState.module.scss";

export function EmptyState({
  title,
  body,
}: {
  title: string;
  body: string;
}) {
  return (
    <div className={styles.root}>
      <h2 className={styles.title}>{title}</h2>
      <p className={styles.body}>{body}</p>
    </div>
  );
}
```

- [ ] **Step 2: Create `src/app/(app)/today/page.tsx`**

```tsx
import { EmptyState } from "@/components/EmptyState";

export default function TodayPage() {
  return (
    <EmptyState
      title="Today"
      body="No active plan yet. Talk to the coach or upload a plan to get started — coming in Phase 4."
    />
  );
}
```

- [ ] **Step 3: Create `src/app/(app)/calendar/page.tsx`**

```tsx
import { EmptyState } from "@/components/EmptyState";

export default function CalendarPage() {
  return (
    <EmptyState
      title="Calendar"
      body="Your training calendar will live here once you have an active plan."
    />
  );
}
```

- [ ] **Step 4: Create `src/app/(app)/plans/page.tsx`**

```tsx
import { EmptyState } from "@/components/EmptyState";

export default function PlansPage() {
  return (
    <EmptyState
      title="Plans"
      body="Upload existing plans or have the coach generate one. Plan management ships in Phase 3."
    />
  );
}
```

- [ ] **Step 5: Create `src/app/(app)/coach/page.tsx`**

```tsx
import { EmptyState } from "@/components/EmptyState";

export default function CoachPage() {
  return (
    <EmptyState
      title="Coach"
      body="Chat with your virtual coach — ships in Phase 4."
    />
  );
}
```

- [ ] **Step 6: Create `src/app/(app)/settings/page.tsx`**

```tsx
import { EmptyState } from "@/components/EmptyState";

export default function SettingsPage() {
  return (
    <EmptyState
      title="Settings"
      body="Preferences UI lands in Task 12."
    />
  );
}
```

- [ ] **Step 7: Smoke test**

```bash
pnpm dev
```

Sign in, then click each tab. Confirm:
- All five pages render without errors
- Active tab highlights correctly
- Mobile layout (resize the window narrow): bottom tab bar
- Desktop (wide): left sidebar

`Ctrl-C` to stop.

- [ ] **Step 8: Commit**

```bash
git add .
git commit -m "Add placeholder pages for Today / Calendar / Plans / Coach / Settings"
```

---

## Task 11: Add the floating "Ask coach" button (placeholder)

**Files:**
- Create: `src/components/layout/AskCoachButton.tsx`, `src/components/layout/AskCoachButton.module.scss`
- Modify: `src/components/layout/AppShell.tsx`

- [ ] **Step 1: Install Radix Dialog**

```bash
pnpm add @radix-ui/react-dialog
```

- [ ] **Step 2: Create the button styles**

`src/components/layout/AskCoachButton.module.scss`:

```scss
.fab {
  position: fixed;
  right: var(--space-4);
  bottom: calc(var(--shell-tabbar-height) + var(--space-4));
  height: 56px;
  padding: 0 var(--space-6);
  border-radius: 28px;
  background: var(--color-accent);
  color: #ffffff;
  border: none;
  font-weight: 600;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
  z-index: 50;

  @media (min-width: 768px) {
    bottom: var(--space-6);
    right: var(--space-6);
  }
}

.overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.5);
  z-index: 100;
}

.content {
  position: fixed;
  left: 50%;
  top: 50%;
  transform: translate(-50%, -50%);
  background: var(--color-bg);
  color: var(--color-fg);
  border-radius: var(--radius-lg);
  padding: var(--space-6);
  width: min(420px, 90vw);
  z-index: 101;
}

.title {
  margin: 0 0 var(--space-2);
  font-size: 1.25rem;
  font-weight: 700;
}

.body {
  color: var(--color-muted);
  margin: 0 0 var(--space-6);
}

.close {
  background: var(--color-fg);
  color: var(--color-bg);
  border: none;
  border-radius: var(--radius-md);
  padding: var(--space-2) var(--space-4);
  font-weight: 600;
}
```

- [ ] **Step 3: Create the button component**

`src/components/layout/AskCoachButton.tsx`:

```tsx
"use client";

import * as Dialog from "@radix-ui/react-dialog";
import styles from "./AskCoachButton.module.scss";

export function AskCoachButton() {
  return (
    <Dialog.Root>
      <Dialog.Trigger asChild>
        <button className={styles.fab} aria-label="Ask coach">
          Ask coach
        </button>
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className={styles.overlay} />
        <Dialog.Content className={styles.content}>
          <Dialog.Title className={styles.title}>Coach coming soon</Dialog.Title>
          <Dialog.Description className={styles.body}>
            The coach lands in Phase 4. For now, take a look at the empty
            Today / Calendar / Plans tabs.
          </Dialog.Description>
          <Dialog.Close asChild>
            <button className={styles.close}>Close</button>
          </Dialog.Close>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
```

- [ ] **Step 4: Add the button to AppShell**

Modify `src/components/layout/AppShell.tsx`:

```tsx
import { NavLinks } from "./NavLinks";
import { AskCoachButton } from "./AskCoachButton";
import styles from "./AppShell.module.scss";

export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <div className={styles.shell}>
      <aside className={styles.sidebar}>
        <div className={styles.brand}>colbystrainingplan</div>
        <NavLinks variant="sidebar" />
      </aside>
      <main className={styles.main}>{children}</main>
      <div className={styles.tabs}>
        <NavLinks variant="tabs" />
      </div>
      <AskCoachButton />
    </div>
  );
}
```

- [ ] **Step 5: Smoke test**

```bash
pnpm dev
```

Confirm the floating button appears bottom-right. Click it — modal opens. Close it. Sign out and confirm the button does NOT appear on the landing page.

`Ctrl-C` to stop.

- [ ] **Step 6: Commit**

```bash
git add .
git commit -m "Add Ask coach floating button (placeholder modal)"
```

---

## Task 12: Implement preferences capture + Settings UI

**Files:**
- Create: `src/app/api/preferences/route.ts`, `src/app/api/preferences/__tests__/route.test.ts`, `src/components/PreferencesCapture.tsx`, `src/lib/preferences.ts`, `src/app/(app)/settings/SettingsForm.tsx`, `src/app/(app)/settings/SettingsForm.module.scss`
- Modify: `src/app/(app)/layout.tsx`, `src/app/(app)/settings/page.tsx`

- [ ] **Step 1: Add a Zod schema for the preferences payload**

```bash
pnpm add zod
```

`src/lib/preferences.ts`:

```ts
import { z } from "zod";

export const PreferencesSchema = z.object({
  units: z.enum(["mi", "km"]),
  timezone: z.string().min(1),
  pace_format: z.enum(["min_per_mi", "min_per_km"]),
  power_units: z.literal("watts"),
});

export type PreferencesPayload = z.infer<typeof PreferencesSchema>;
```

- [ ] **Step 2: Write the failing API route test**

`src/app/api/preferences/__tests__/route.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock the auth module before importing the route.
const mockAuth = vi.fn();
vi.mock("@/auth", () => ({ auth: () => mockAuth() }));

const updateMock = vi.fn();
vi.mock("@/db", () => ({
  db: {
    update: () => ({
      set: () => ({
        where: () => updateMock(),
      }),
    }),
  },
}));

// Note: we deliberately do NOT mock @/db/schema. The schema is pure data
// (Drizzle column definitions) and imports cleanly without a DB. Mocking
// it would make `eq(users.id, ...)` brittle.

import { POST } from "../route";

describe("POST /api/preferences", () => {
  beforeEach(() => {
    mockAuth.mockReset();
    updateMock.mockReset();
  });

  it("returns 401 if not authed", async () => {
    mockAuth.mockResolvedValue(null);
    const req = new Request("http://test/api/preferences", {
      method: "POST",
      body: JSON.stringify({
        units: "mi",
        timezone: "America/Los_Angeles",
        pace_format: "min_per_mi",
        power_units: "watts",
      }),
    });
    const res = await POST(req);
    expect(res.status).toBe(401);
  });

  it("returns 400 on invalid payload", async () => {
    mockAuth.mockResolvedValue({ user: { id: "u1" } });
    const req = new Request("http://test/api/preferences", {
      method: "POST",
      body: JSON.stringify({ units: "lightyears" }),
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it("updates preferences for the authed user", async () => {
    mockAuth.mockResolvedValue({ user: { id: "u1" } });
    updateMock.mockResolvedValue(undefined);
    const req = new Request("http://test/api/preferences", {
      method: "POST",
      body: JSON.stringify({
        units: "km",
        timezone: "Europe/London",
        pace_format: "min_per_km",
        power_units: "watts",
      }),
    });
    const res = await POST(req);
    expect(res.status).toBe(200);
    expect(updateMock).toHaveBeenCalledOnce();
  });
});
```

- [ ] **Step 3: Run the test, expect failure**

```bash
pnpm test
```

Expected: FAILS — module `../route` does not exist.

- [ ] **Step 4: Implement the route**

`src/app/api/preferences/route.ts`:

```ts
import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { db } from "@/db";
import { users } from "@/db/schema";
import { eq } from "drizzle-orm";
import { PreferencesSchema } from "@/lib/preferences";

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }

  const parsed = PreferencesSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid payload", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  await db
    .update(users)
    .set({ preferences: parsed.data })
    .where(eq(users.id, session.user.id));

  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 5: Run the test, expect pass**

```bash
pnpm test
```

Expected: 3 tests pass.

- [ ] **Step 6: Implement the client-side capture component**

`src/components/PreferencesCapture.tsx`:

```tsx
"use client";

import { useEffect } from "react";

type Props = {
  needsCapture: boolean;
};

export function PreferencesCapture({ needsCapture }: Props) {
  useEffect(() => {
    if (!needsCapture) return;
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
    fetch("/api/preferences", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        units: "mi",
        timezone: tz,
        pace_format: "min_per_mi",
        power_units: "watts",
      }),
    }).catch(() => {
      // Silent — user can fix in Settings.
    });
  }, [needsCapture]);

  return null;
}
```

- [ ] **Step 7: Wire capture into the authenticated layout**

Modify `src/app/(app)/layout.tsx`:

```tsx
import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { AppShell } from "@/components/layout/AppShell";
import { PreferencesCapture } from "@/components/PreferencesCapture";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();
  if (!session?.user) redirect("/");

  // Default timezone is "UTC" (set in DEFAULT_PREFERENCES).
  // First-time capture sets it from the browser's IANA tz.
  const needsCapture = session.user.preferences.timezone === "UTC";

  return (
    <AppShell>
      <PreferencesCapture needsCapture={needsCapture} />
      {children}
    </AppShell>
  );
}
```

- [ ] **Step 8: Build the Settings UI**

`src/app/(app)/settings/SettingsForm.module.scss`:

```scss
.form {
  display: flex;
  flex-direction: column;
  gap: var(--space-6);
  max-width: 480px;
}

.field {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}

.label {
  font-weight: 600;
  font-size: 0.875rem;
}

.select,
.input {
  padding: var(--space-2) var(--space-3);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  background: var(--color-bg);
  color: var(--color-fg);
  font: inherit;
}

.button {
  align-self: flex-start;
  background: var(--color-fg);
  color: var(--color-bg);
  border: none;
  border-radius: var(--radius-md);
  padding: var(--space-3) var(--space-6);
  font-weight: 600;
}

.status {
  font-size: 0.875rem;
  color: var(--color-muted);
}
```

`src/app/(app)/settings/SettingsForm.tsx`:

```tsx
"use client";

import { useState } from "react";
import type { UserPreferences } from "@/db/schema";
import styles from "./SettingsForm.module.scss";

export function SettingsForm({ initial }: { initial: UserPreferences }) {
  const [units, setUnits] = useState<UserPreferences["units"]>(initial.units);
  const [timezone, setTimezone] = useState(initial.timezone);
  const [paceFormat, setPaceFormat] = useState<UserPreferences["pace_format"]>(
    initial.pace_format,
  );
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "error">(
    "idle",
  );

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setStatus("saving");
    const res = await fetch("/api/preferences", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        units,
        timezone,
        pace_format: paceFormat,
        power_units: "watts",
      }),
    });
    setStatus(res.ok ? "saved" : "error");
  }

  return (
    <form className={styles.form} onSubmit={onSubmit}>
      <div className={styles.field}>
        <label className={styles.label} htmlFor="units">
          Units
        </label>
        <select
          id="units"
          className={styles.select}
          value={units}
          onChange={(e) => setUnits(e.target.value as UserPreferences["units"])}
        >
          <option value="mi">Miles (mi)</option>
          <option value="km">Kilometers (km)</option>
        </select>
      </div>

      <div className={styles.field}>
        <label className={styles.label} htmlFor="timezone">
          Timezone (IANA)
        </label>
        <input
          id="timezone"
          className={styles.input}
          value={timezone}
          onChange={(e) => setTimezone(e.target.value)}
          placeholder="America/Los_Angeles"
        />
      </div>

      <div className={styles.field}>
        <label className={styles.label} htmlFor="pace">
          Pace format
        </label>
        <select
          id="pace"
          className={styles.select}
          value={paceFormat}
          onChange={(e) =>
            setPaceFormat(e.target.value as UserPreferences["pace_format"])
          }
        >
          <option value="min_per_mi">Min/mile</option>
          <option value="min_per_km">Min/km</option>
        </select>
      </div>

      <button className={styles.button} type="submit">
        Save
      </button>
      {status === "saving" && <span className={styles.status}>Saving…</span>}
      {status === "saved" && <span className={styles.status}>Saved.</span>}
      {status === "error" && (
        <span className={styles.status}>Error saving — try again.</span>
      )}
    </form>
  );
}
```

- [ ] **Step 9: Replace the Settings placeholder page**

`src/app/(app)/settings/page.tsx`:

```tsx
import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { SettingsForm } from "./SettingsForm";

export default async function SettingsPage() {
  const session = await auth();
  if (!session?.user) redirect("/");

  return (
    <>
      <h1>Settings</h1>
      <SettingsForm initial={session.user.preferences} />
    </>
  );
}
```

- [ ] **Step 10: Smoke test**

```bash
pnpm dev
```

If you have an existing user from earlier sign-in: open Drizzle Studio (`pnpm db:studio`), edit that user's `preferences.timezone` back to `"UTC"`, save. Reload the app — the auto-capture should set the real browser timezone within a second. Confirm via Studio that `preferences.timezone` is now your IANA zone (e.g., `America/Los_Angeles`).

Then visit `/settings` and confirm the form renders with current values. Change units to `km`, save, reload, confirm it persisted.

`Ctrl-C` to stop.

- [ ] **Step 11: Commit**

```bash
git add .
git commit -m "Capture user preferences + settings page"
```

---

## Task 13: Add error boundary, not-found, and loading states

**Files:**
- Create: `src/app/error.tsx`, `src/app/not-found.tsx`, `src/app/(app)/loading.tsx`

- [ ] **Step 1: Create the global error boundary**

`src/app/error.tsx`:

```tsx
"use client";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error;
  reset: () => void;
}) {
  return (
    <html>
      <body>
        <main style={{ padding: "var(--space-8)", textAlign: "center" }}>
          <h1>Something went wrong</h1>
          <p style={{ color: "var(--color-muted)" }}>{error.message}</p>
          <button
            onClick={reset}
            style={{
              marginTop: "var(--space-4)",
              padding: "var(--space-3) var(--space-6)",
              borderRadius: "var(--radius-md)",
              border: "1px solid var(--color-border)",
              background: "var(--color-bg)",
              color: "var(--color-fg)",
            }}
          >
            Try again
          </button>
        </main>
      </body>
    </html>
  );
}
```

- [ ] **Step 2: Create the not-found page**

`src/app/not-found.tsx`:

```tsx
import Link from "next/link";

export default function NotFound() {
  return (
    <main
      style={{
        padding: "var(--space-8)",
        textAlign: "center",
        minHeight: "100vh",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <h1>Not found</h1>
      <p style={{ color: "var(--color-muted)" }}>
        That page doesn't exist.
      </p>
      <Link
        href="/today"
        style={{
          marginTop: "var(--space-4)",
          padding: "var(--space-3) var(--space-6)",
          borderRadius: "var(--radius-md)",
          background: "var(--color-fg)",
          color: "var(--color-bg)",
          fontWeight: 600,
        }}
      >
        Go home
      </Link>
    </main>
  );
}
```

- [ ] **Step 3: Create a loading state for the (app) group**

`src/app/(app)/loading.tsx`:

```tsx
export default function Loading() {
  return (
    <div style={{ padding: "var(--space-8)", color: "var(--color-muted)" }}>
      Loading…
    </div>
  );
}
```

- [ ] **Step 4: Smoke test**

```bash
pnpm dev
```

Visit `/does-not-exist` → confirm not-found page renders. Visit `/today` and reload several times — confirm the loading state may briefly flash. The error boundary is hard to trigger manually; we'll trust it.

`Ctrl-C` to stop.

- [ ] **Step 5: Commit**

```bash
git add .
git commit -m "Add error boundary, not-found, and loading states"
```

---

## Task 14: Final verification + Vercel-ready production build

**Files:**
- Modify: nothing (verification only)

- [ ] **Step 1: Run all tests**

```bash
pnpm test
```

Expected: all tests pass (sanity test + schema tests + preferences route tests = ~7 tests).

- [ ] **Step 2: Run typecheck**

```bash
pnpm tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Run lint**

```bash
pnpm lint
```

Expected: no errors.

- [ ] **Step 4: Run a production build**

```bash
pnpm build
```

Expected: build succeeds. Inspect the output — note that all `(app)/*` routes are listed as dynamic (they call `auth()`).

- [ ] **Step 5: Smoke-test the production build locally**

```bash
pnpm start
```

Open `http://localhost:3000`. Sign out and back in. Click through Today / Calendar / Plans / Settings. Toggle the Ask coach modal. Confirm everything works.

`Ctrl-C` to stop.

- [ ] **Step 6: Final commit if any cleanup happened**

```bash
git status
# If nothing changed, skip. Otherwise:
git add .
git commit -m "Phase 1 verification pass"
```

- [ ] **Step 7: Push to origin**

```bash
git push origin master
```

---

## Phase 1 Done — what works now

- A user can sign in with Strava and see the four tabs (Today / Calendar / Plans / Coach) with empty placeholder content.
- The `Ask coach` floating button is visible on every authenticated page and opens a "coming soon" modal.
- User preferences (units, timezone, pace format) are auto-captured on first sign-in and editable in `/settings`.
- The data model has NextAuth's tables + `users.preferences` ready for Phase 2 to extend with plans, workouts, activities, and the rest.

## What's next (NOT in this plan)

Phase 2 will build Strava activity sync (initial 90-day backfill + webhook subscription) on top of this foundation. The `accounts` table already holds the Strava `access_token` and `refresh_token` from this phase's OAuth flow — Phase 2 only needs to add the activity tables and the sync logic.

Bring this plan back as a separate brainstorming + writing-plans cycle when ready.
