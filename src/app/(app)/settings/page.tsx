import { Suspense } from "react";
import { dehydrate, HydrationBoundary, QueryClient } from "@tanstack/react-query";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { getSession } from "@/lib/get-session";
import { db } from "@/server/db";
import { users } from "@/server/db/schema";
import { SettingsForm } from "./settings-form";
import { Button } from "@/components/button/button";
import { signOutAction } from "@/app/_actions/sign-out";
import { PageHeader } from "@/components/layout/page-header";
import { SettingsFormSkeleton } from "@/components/skeletons/settings-form-skeleton";
import styles from "./settings.module.scss";

export default async function SettingsPage() {
  const session = await getSession();
  if (!session?.user?.id) redirect("/");
  const userId = session.user.id;
  const prefs = session.user.preferences;

  const [row] = await db
    .select({ coach_notes: users.coach_notes })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  const coachNotes = row?.coach_notes ?? "";

  const queryClient = new QueryClient();
  const s = <T,>(v: T): T => JSON.parse(JSON.stringify(v));
  queryClient.setQueryData(["preferences"], s(prefs));
  queryClient.setQueryData(["coach", "notes"], s(coachNotes));

  return (
    <HydrationBoundary state={dehydrate(queryClient)}>
      <div className={styles.page}>
        <PageHeader title="Settings" />
        <div className={styles.scrollArea}>
          <Suspense fallback={<SettingsFormSkeleton />}>
            <SettingsForm />
          </Suspense>
          <form action={signOutAction} className={styles.signOut}>
            <Button type="submit" variant="danger">
              Log out
            </Button>
          </form>
        </div>
      </div>
    </HydrationBoundary>
  );
}
