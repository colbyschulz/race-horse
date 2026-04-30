import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { Button } from "@/components/button/button";
import { signInWithStrava } from "./_actions/sign-in";
import styles from "./page.module.scss";

export default async function HomePage() {
  const session = await auth();
  if (session?.user) redirect("/today");

  return (
    <main className={styles.main}>
      <h1 className={styles.title}>Race Horse</h1>
      <form action={signInWithStrava}>
        <Button type="submit" variant="primary" className={styles.signIn}>
          Sign in with Strava
        </Button>
      </form>
    </main>
  );
}
