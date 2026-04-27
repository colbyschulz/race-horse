// src/components/plans/InFlightUploadCard.tsx
"use client";
import Link from "next/link";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import styles from "./InFlightUploadCard.module.scss";

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
        <div className={styles.spinner} aria-hidden="true" />
        <div className={styles.body}>
          <p className={styles.title}>Extracting your plan…</p>
          <p className={styles.sub}>{row.original_filename}</p>
        </div>
        <button type="button" className={styles.btnGhost} disabled={disabled} onClick={discard}>
          Cancel
        </button>
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
            <button type="button" className={`${styles.btnSmall} ${styles.btnSmallDanger}`} disabled={disabled} onClick={discard}>
              Yes
            </button>
            <button type="button" className={styles.btnSmall} disabled={disabled} onClick={() => setConfirmDiscard(false)}>
              No
            </button>
          </div>
        ) : (
          <div className={styles.actions}>
            <button type="button" className={styles.btnGhost} disabled={disabled} onClick={() => setConfirmDiscard(true)}>
              Discard
            </button>
            <Link href={`/plans/upload/${row.id}/review`} className={styles.btnPrimary}>
              Review →
            </Link>
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
        <button type="button" className={styles.btnPrimary} disabled={disabled} onClick={retry}>
          Retry
        </button>
        <Link href={`/coach?from=/plans&plan_file_id=${row.id}`} className={styles.btnSecondary}>
          Talk to coach
        </Link>
        <button type="button" className={styles.btnDanger} disabled={disabled} onClick={() => setConfirmDiscard(true)}>
          Discard
        </button>
      </div>
      {confirmDiscard && (
        <div className={styles.confirmRow}>
          <span className={styles.confirmLabel}>Discard this upload?</span>
          <button type="button" className={`${styles.btnSmall} ${styles.btnSmallDanger}`} disabled={disabled} onClick={discard}>
            Yes
          </button>
          <button type="button" className={styles.btnSmall} disabled={disabled} onClick={() => setConfirmDiscard(false)}>
            No
          </button>
        </div>
      )}
    </div>
  );
}
