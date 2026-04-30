import { auth as proxy } from "@/server/auth";

export { proxy };

export const config = {
  matcher: ["/((?!api/auth|_next/static|_next/image|favicon.ico).*)"],
};
