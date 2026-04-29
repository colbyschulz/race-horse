// src/app/(app)/plans/upload/[id]/review/ReviewClient.tsx
"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { InFlightUploadCard } from "@/components/plans/InFlightUploadCard";
import { ReviewForm } from "./ReviewForm";
import styles from "./Review.module.scss";

interface FileSnapshot {
  id: string;
  status: "extracting" | "extracted" | "failed";
  original_filename: string;
  extraction_error: string | null;
  extracted_payload: unknown | null;
}

interface Props {
  initialFile: FileSnapshot;
  units: "mi" | "km";
  today: string;
  hasActivePlan: boolean;
  isRetry: boolean;
}

export function ReviewClient({ initialFile, units, today, hasActivePlan, isRetry }: Props) {
  const router = useRouter();
  const [file, setFile] = useState(initialFile);

  useEffect(() => {
    // Poll while extracting, or briefly after a retry (status may still be "failed" due to race)
    if (file.status !== "extracting" && !(isRetry && file.status === "failed")) return;
    let cancelled = false;
    const tick = async () => {
      try {
        const res = await fetch(`/api/plans/upload/${file.id}`);
        if (!res.ok) return;
        const data = (await res.json()) as FileSnapshot;
        if (!cancelled) setFile(data);
      } catch {
        /* swallow */
      }
    };
    const handle = setInterval(tick, 2000);
    return () => {
      cancelled = true;
      clearInterval(handle);
    };
  }, [file.id, file.status, isRetry]);

  if (file.status === "extracting" || file.status === "failed") {
    return (
      <div className={styles.page}>
        <header className={styles.header}>
          <h1 className={styles.title}>Review plan</h1>
          <p className={styles.sub}>{file.original_filename}</p>
        </header>
        <InFlightUploadCard row={file} />
      </div>
    );
  }

  // extracted — plan title becomes the heading inside ReviewForm
  return (
    <div className={styles.page}>
      <ReviewForm
        fileId={file.id}
        payload={file.extracted_payload as never}
        units={units}
        today={today}
        hasActivePlan={hasActivePlan}
        onDiscarded={() => router.push("/plans")}
        onSaved={() => router.push("/plans")}
      />
    </div>
  );
}
