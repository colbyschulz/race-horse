import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { users } from "@/db/schema";
import { SettingsForm } from "./SettingsForm";
import { CoachNotesEditor } from "@/components/coach/CoachNotesEditor";
import styles from "./Settings.module.scss";

export default async function SettingsPage() {
  const session = await auth();
  if (!session?.user) redirect("/");

  const rows = await db
    .select({ coach_notes: users.coach_notes })
    .from(users)
    .where(eq(users.id, session.user.id!))
    .limit(1);
  const coachNotes = rows[0]?.coach_notes ?? "";

  return (
    <div className={styles.page}>
      <h1 className={styles.header}>Settings</h1>
      <SettingsForm initial={session.user.preferences} />
      <CoachNotesEditor initialContent={coachNotes} />
    </div>
  );
}
