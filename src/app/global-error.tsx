"use client";

// This replaces the root layout when it renders, so it has to bring the global
// styles (and with them the design tokens) itself.
import "@/styles/globals.scss";
import { Button } from "@/components/button/button";
import styles from "./error-page.module.scss";

export default function GlobalError({ error, reset }: { error: Error; reset: () => void }) {
  return (
    <html lang="en">
      <body>
        <main className={`${styles.page} ${styles.fullScreen}`}>
          <h1 className={styles.title}>Something went wrong</h1>
          <p className={styles.message}>{error.message}</p>
          <Button variant="primary" onClick={reset}>
            Try again
          </Button>
        </main>
      </body>
    </html>
  );
}
