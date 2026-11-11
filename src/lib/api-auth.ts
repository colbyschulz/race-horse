import { NextResponse } from "next/server";
import { auth } from "@/server/auth";
import { unauthorized } from "@/lib/api-responses";
import type { UserPreferences } from "@/types/preferences";

export interface SignedInUser {
  userId: string;
  preferences: UserPreferences;
}

/**
 * Resolve the signed-in user or short-circuit with a 401 response.
 *
 * Usage in a route handler:
 *   const user = await requireUser();
 *   if (user instanceof NextResponse) return user;
 *   const { userId } = user;
 */
export async function requireUser(): Promise<SignedInUser | NextResponse> {
  const session = await auth();
  if (!session?.user?.id) return unauthorized();
  return { userId: session.user.id, preferences: session.user.preferences };
}
