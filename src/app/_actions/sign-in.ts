"use server";

import { signIn } from "@/server/auth";

export async function signInWithStrava() {
  await signIn("strava", { redirectTo: "/today" });
}
