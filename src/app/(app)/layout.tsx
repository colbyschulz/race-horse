import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { AppShell } from "@/components/layout/AppShell";
import { PreferencesCapture } from "@/components/PreferencesCapture";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();
  if (!session?.user) redirect("/");

  const needsCapture = session.user.preferences.timezone === "UTC";

  return (
    <AppShell>
      <PreferencesCapture needsCapture={needsCapture} />
      {children}
    </AppShell>
  );
}
