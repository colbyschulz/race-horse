import { Button } from "@/components/button/button";
import { ClearCachedShell } from "@/components/service-worker-registration";
import { signInWithStrava } from "./_actions/sign-in";
import styles from "./page.module.scss";

// No session check here: the proxy already sends anyone holding a session
// cookie to /today, so this page only renders for signed-out visitors.
export default function HomePage() {
  return (
    <main className={styles.main}>
      <ClearCachedShell />
      <h1 className={styles.title}>Race Horse</h1>
      <form action={signInWithStrava}>
        <Button type="submit" variant="primary" className={styles.signIn}>
          Sign in with Strava
        </Button>
      </form>
    </main>
  );
}
