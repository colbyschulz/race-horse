import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { Button } from "@/components/Button";
import { signInWithStrava } from "./_actions/sign-in";
import styles from "./page.module.scss";

export default async function HomePage() {
  const session = await auth();
  if (session?.user) redirect("/today");

  return (
    <main className={styles.main}>
      <h1 className={styles.title}>Race Horse</h1>
      <div className={styles.divider} />
      <ul className={styles.features}>
        <li className={styles.feature}>
          <span className={styles.bullet}>◆</span>
          <span>Build plans with an AI coach that knows your data</span>
        </li>
        <li className={styles.feature}>
          <span className={styles.bullet}>◆</span>
          <span>Synced from Strava — your history, your pace zones</span>
        </li>
        <li className={styles.feature}>
          <span className={styles.bullet}>◆</span>
          <span>Adjust in plain language, on any device</span>
        </li>
      </ul>
      <form action={signInWithStrava}>
        <Button type="submit" variant="primary" className={styles.signIn}>
          Sign in with Strava
        </Button>
      </form>
      <p className={styles.domain}>race.horse</p>
    </main>
  );
}
