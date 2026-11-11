import "server-only";

import NextAuth from "next-auth";
import type { Adapter, AdapterSession, AdapterUser } from "next-auth/adapters";
import { DrizzleAdapter } from "@auth/drizzle-adapter";
import { db } from "@/server/db";
import { sessions, users, DEFAULT_PREFERENCES, type UserPreferences } from "@/server/db/schema";
import { eq } from "drizzle-orm";
import { authConfig } from "./config";

type UserWithPreferences = AdapterUser & { preferences: UserPreferences };

const baseAdapter = DrizzleAdapter(db);

const adapter: Adapter = {
  ...baseAdapter,
  // Every authenticated request runs this. The stock version doesn't know
  // about the preferences column, which used to cost a second database round
  // trip in the session callback; reading it in the same join makes it one.
  async getSessionAndUser(sessionToken) {
    const [row] = await db
      .select({
        session: sessions,
        user: {
          id: users.id,
          name: users.name,
          email: users.email,
          emailVerified: users.emailVerified,
          image: users.image,
          preferences: users.preferences,
        },
      })
      .from(sessions)
      .innerJoin(users, eq(users.id, sessions.userId))
      .where(eq(sessions.sessionToken, sessionToken))
      .limit(1);
    if (!row) return null;
    return {
      session: row.session satisfies AdapterSession,
      user: row.user as UserWithPreferences,
    };
  },
};

export const { handlers, signIn, signOut, auth } = NextAuth({
  ...authConfig,
  adapter,
  session: { strategy: "database" },
  callbacks: {
    session({ session, user }) {
      session.user.id = user.id;
      session.user.preferences = (user as UserWithPreferences).preferences ?? DEFAULT_PREFERENCES;
      return session;
    },
  },
});
