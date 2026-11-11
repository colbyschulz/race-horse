import { Button } from "@/components/button/button";
import styles from "./error-page.module.scss";

export default function NotFound() {
  return (
    <main className={`${styles.page} ${styles.fullScreen}`}>
      <h1 className={styles.title}>Not found</h1>
      <p className={styles.message}>That page doesn&apos;t exist.</p>
      <Button href="/today" variant="primary">
        Go home
      </Button>
    </main>
  );
}
