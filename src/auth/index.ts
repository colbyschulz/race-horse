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
