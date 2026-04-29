"use client";
import * as Dialog from "@radix-ui/react-dialog";
import { Button } from "@/components/Button";
import styles from "./ClearChatDialog.module.scss";

interface Props {
  open: boolean;
  onClose: () => void;
  onConfirm: () => Promise<void>;
}

export function ClearChatDialog({ open, onClose, onConfirm }: Props) {
  async function handleConfirm() {
    await onConfirm();
    onClose();
  }
  return (
    <Dialog.Root open={open} onOpenChange={(o) => !o && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className={styles.overlay} />
        <Dialog.Content className={styles.content}>
          <Dialog.Title className={styles.title}>Clear chat?</Dialog.Title>
          <Dialog.Description className={styles.description}>
            This wipes the current chat. Your coach notes will not be affected.
          </Dialog.Description>
          <div className={styles.actions}>
            <Dialog.Close asChild>
              <Button variant="ghost">Cancel</Button>
            </Dialog.Close>
            <Button variant="dangerSolid" onClick={handleConfirm}>Clear chat</Button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
