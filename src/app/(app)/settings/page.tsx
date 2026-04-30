import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { eq } from "drizzle-orm";
import { users } from "@/db/schema";
import { SettingsForm } from "./SettingsForm";
import { Button } from "@/components/Button";
import { signOutAction } from "@/app/_actions/sign-out";
import { PageHeader } from "@/components/layout/PageHeader";
import styles from "./Settings.module.scss";

export default async function SettingsPage() {
  const session = await auth();
  if (!session?.user) redirect("/");

  const [row] = await db
    .select({ coach_notes: users.coach_notes })
    .from(users)
    .where(eq(users.id, session.user.id!))
    .limit(1);
  const coachNotes = row?.coach_notes ?? "";

  return (
    <div className={styles.page}>
      <PageHeader title="Settings" />
      <div className={styles.scrollArea}>
        <SettingsForm
          initialPreferences={session.user.preferences}
          initialCoachNotes={coachNotes}
        />
        <form action={signOutAction} className={styles.signOut}>
          <Button type="submit" variant="danger">
            Log out
          </Button>
        </form>
      </div>
    </div>
  );
}
