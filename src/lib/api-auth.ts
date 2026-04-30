import { NextResponse } from "next/server";
import { auth } from "@/server/auth";

/**
 * Resolve the current authenticated user or short-circuit with a 401 response.
 *
 * Usage in a route handler:
 *   const result = await requireUser();
 *   if (result instanceof NextResponse) return result;
 *   const { userId } = result;
 */
export async function requireUser(): Promise<{ userId: string } | NextResponse> {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  return { userId: session.user.id };
}
