"use client";

import { Button } from "@/components/button/button";
import styles from "./error-page.module.scss";

export default function Error({ error, reset }: { error: Error; reset: () => void }) {
  return (
    <main className={styles.page}>
      <h2 className={`${styles.title} ${styles.titleSmall}`}>Something went wrong</h2>
      <p className={styles.message}>{error.message}</p>
      <Button variant="primary" onClick={reset}>
        Try again
      </Button>
    </main>
  );
}
