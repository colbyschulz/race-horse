import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { SettingsForm } from "./SettingsForm";
import { CoachNotesSection } from "./CoachNotesSection";
import { CoachNotesSkeleton } from "./CoachNotesSkeleton";
import { Button } from "@/components/Button";
import { signOutAction } from "@/app/_actions/sign-out";
import styles from "./Settings.module.scss";

export default async function SettingsPage() {
  const session = await auth();
  if (!session?.user) redirect("/");

  return (
    <div className={styles.page}>
      <h1 className={styles.header}>Settings</h1>
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
