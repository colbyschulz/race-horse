import type { NextAuthConfig } from "next-auth";
import Strava from "./strava";

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
        path.startsWith("/training") ||
        path.startsWith("/plans") ||
        path.startsWith("/settings");
      if (isAppRoute && !isLoggedIn) return false;
      return true;
    },
  },
} satisfies NextAuthConfig;
