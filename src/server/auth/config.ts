import "server-only";

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
} satisfies NextAuthConfig;
