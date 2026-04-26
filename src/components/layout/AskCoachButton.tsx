"use client";

import * as Dialog from "@radix-ui/react-dialog";
import styles from "./AskCoachButton.module.scss";

export function AskCoachButton() {
  return (
    <Dialog.Root>
      <Dialog.Trigger asChild>
        <button className={styles.fab} aria-label="Ask coach">
          <span aria-hidden>✦</span>
          Coach
        </button>
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className={styles.overlay} />
        <Dialog.Content className={styles.content}>
          <Dialog.Title className={styles.title}>Coach coming soon</Dialog.Title>
          <Dialog.Description className={styles.body}>
            The AI coach launches in Phase 4. In the meantime, explore the
            Today, Calendar, and Plans tabs.
          </Dialog.Description>
          <Dialog.Close asChild>
            <button className={styles.close}>Close</button>
          </Dialog.Close>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
