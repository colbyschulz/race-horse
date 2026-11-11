"use client";
import { useRouter } from "next/navigation";
import { InFlightUploadCard } from "@/components/plans/in-flight-upload-card";
import { ReviewForm } from "./review-form";
import styles from "./review.module.scss";

interface FileSnapshot {
  id: string;
  status: "extracting" | "extracted" | "failed";
  original_filename: string;
  extraction_error: string | null;
  extracted_payload: unknown | null;
}

interface Props {
  file: FileSnapshot;
  units: "mi" | "km";
  today: string;
  hasActivePlan: boolean;
}

export function ReviewClient({ file, units, today, hasActivePlan }: Props) {
  const router = useRouter();

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
