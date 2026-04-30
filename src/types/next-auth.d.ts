import type { UserPreferences } from "@/types/preferences";

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
