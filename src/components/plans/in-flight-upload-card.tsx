// src/components/plans/InFlightUploadCard.tsx
"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/button/button";
import { Spinner } from "@/components/spinner/spinner";
import styles from "./in-flight-upload-card.module.scss";

interface Row {
  id: string;
  status: "extracting" | "extracted" | "failed";
  original_filename: string;
  extraction_error: string | null;
}

export function InFlightUploadCard({ row }: { row: Row }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [busy, setBusy] = useState(false);
  const [confirmDiscard, setConfirmDiscard] = useState(false);

  async function discard() {
    setBusy(true);
    try {
      await fetch(`/api/plans/upload/${row.id}`, { method: "DELETE" });
    } finally {
      startTransition(() => router.refresh());
    }
  }

  async function retry() {
    setBusy(true);
    void fetch(`/api/plans/upload/${row.id}/extract?reset=1`, { method: "POST" });
    router.push(`/plans/upload/${row.id}/review?retry=1`);
  }

  const disabled = busy || pending;

  if (row.status === "extracting") {
    return (
      <div className={styles.card}>
        <Spinner size="md" style={{ color: "var(--color-brown)" }} />
        <div className={styles.body}>
          <p className={styles.title}>Extracting your plan…</p>
          <p className={styles.sub}>{row.original_filename}</p>
        </div>
        <Button variant="ghost" disabled={disabled} onClick={discard}>
          Cancel
        </Button>
      </div>
    );
  }

  if (row.status === "extracted") {
    return (
      <div className={styles.card}>
        <div className={styles.body}>
          <p className={styles.title}>Ready to review</p>
          <p className={styles.sub}>{row.original_filename}</p>
        </div>
        {confirmDiscard ? (
          <div className={styles.confirmRow}>
            <span className={styles.confirmLabel}>Discard?</span>
            <Button variant="danger" size="sm" disabled={disabled} onClick={discard}>
              Yes
            </Button>
            <Button
              variant="ghost"
              size="sm"
              disabled={disabled}
              onClick={() => setConfirmDiscard(false)}
            >
              No
            </Button>
          </div>
        ) : (
          <div className={styles.actions}>
            <Button variant="ghost" disabled={disabled} onClick={() => setConfirmDiscard(true)}>
              Discard
            </Button>
            <Button variant="primary" href={`/plans/upload/${row.id}/review`}>
              Review →
            </Button>
          </div>
        )}
      </div>
    );
  }

  // failed
  return (
    <div className={`${styles.card} ${styles.cardFailed}`}>
      <div className={styles.body}>
        <p className={styles.title}>Extraction failed</p>
        <p className={styles.sub}>{row.original_filename}</p>
        {row.extraction_error && <p className={styles.error}>{row.extraction_error}</p>}
      </div>
      <div className={styles.actions}>
        <Button variant="primary" disabled={disabled} onClick={retry}>
          Retry
        </Button>
        <Button variant="secondary" href={`/coach?from=/plans&plan_file_id=${row.id}`}>
          Talk to coach
        </Button>
        <Button variant="danger" disabled={disabled} onClick={() => setConfirmDiscard(true)}>
          Discard
        </Button>
      </div>
      {confirmDiscard && (
        <div className={styles.confirmRow}>
          <span className={styles.confirmLabel}>Discard this upload?</span>
          <Button variant="danger" size="sm" disabled={disabled} onClick={discard}>
            Yes
          </Button>
          <Button
            variant="ghost"
            size="sm"
            disabled={disabled}
            onClick={() => setConfirmDiscard(false)}
          >
            No
          </Button>
        </div>
      )}
    </div>
  );
}
