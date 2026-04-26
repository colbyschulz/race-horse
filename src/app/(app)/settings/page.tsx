import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { SettingsForm } from "./SettingsForm";

export default async function SettingsPage() {
  const session = await auth();
  if (!session?.user) redirect("/");

  return (
    <>
      <h1>Settings</h1>
      <SettingsForm initial={session.user.preferences} />
    </>
  );
}
