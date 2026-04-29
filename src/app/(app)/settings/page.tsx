import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { SettingsForm } from "./SettingsForm";
import { CoachNotesSection } from "./CoachNotesSection";
import { CoachNotesSkeleton } from "./CoachNotesSkeleton";
import { Button } from "@/components/Button";
import { signOutAction } from "@/app/_actions/sign-out";
import { PageHeader } from "@/components/layout/PageHeader";
import { StickyTop } from "@/components/layout/StickyTop";
import styles from "./Settings.module.scss";

export default async function SettingsPage() {
  const session = await auth();
  if (!session?.user) redirect("/");

  return (
    <div className={styles.page}>
      <StickyTop>
        <PageHeader title="Settings" />
      </StickyTop>
      <SettingsForm initial={session.user.preferences} />
      <Suspense fallback={<CoachNotesSkeleton />}>
        <CoachNotesSection userId={session.user.id!} />
      </Suspense>
      <form action={signOutAction} className={styles.signOut}>
        <Button type="submit" variant="danger">
          Log out
        </Button>
      </form>
    </div>
  );
}
