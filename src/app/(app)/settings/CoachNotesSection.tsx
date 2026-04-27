import { db } from "@/db";
import { eq } from "drizzle-orm";
import { users } from "@/db/schema";
import { CoachNotesEditor } from "@/components/coach/CoachNotesEditor";

export async function CoachNotesSection({ userId }: { userId: string }) {
  const rows = await db
    .select({ coach_notes: users.coach_notes })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  const coachNotes = rows[0]?.coach_notes ?? "";
  return <CoachNotesEditor initialContent={coachNotes} />;
}
