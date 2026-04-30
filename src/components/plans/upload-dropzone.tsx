// src/components/plans/UploadDropzone.tsx
"use client";
import { useRef, useState, type ChangeEvent, type DragEvent } from "react";
import { useRouter } from "next/navigation";
import { PlanActionRow } from "./plan-action-row";
import styles from "./upload-dropzone.module.scss";

const MAX_BYTES = 10 * 1024 * 1024;
const ALLOWED_EXT = new Set(["pdf", "csv", "xlsx", "md", "txt"]);
const ACCEPT = ".pdf,.csv,.xlsx,.md,.txt";

function extOf(name: string): string {
  const i = name.lastIndexOf(".");
  return i < 0 ? "" : name.slice(i + 1).toLowerCase();
}

export function UploadDropzone() {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [hover, setHover] = useState(false);

  function pickFile() {
    inputRef.current?.click();
  }

  async function handleFile(file: File) {
    setError(null);
    if (!ALLOWED_EXT.has(extOf(file.name))) {
      setError("Unsupported file type. Use PDF, CSV, Excel, Markdown, or text.");
      return;
    }
    if (file.size > MAX_BYTES) {
      setError("File too large (max 10 MB).");
      return;
    }
    setBusy(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/plans/upload", { method: "POST", body: fd });
      if (!res.ok) {
        const j = (await res.json().catch(() => ({}))) as { error?: string };
        setError(j.error ?? "Upload failed.");
        setBusy(false);
        return;
      }
      const { id } = (await res.json()) as { id: string };
      // Fire extract; do not await the response — review page polls instead.
      void fetch(`/api/plans/upload/${id}/extract`, { method: "POST" });
      router.push(`/plans/upload/${id}/review`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed.");
      setBusy(false);
    }
  }

  function onChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) void handleFile(file);
  }

  function onDrop(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setHover(false);
    const file = e.dataTransfer.files?.[0];
    if (file) void handleFile(file);
  }

  return (
    <div
      className={`${styles.zone} ${hover ? styles.hover : ""}`}
      onDragOver={(e) => {
        e.preventDefault();
        setHover(true);
      }}
      onDragLeave={() => setHover(false)}
      onDrop={onDrop}
    >
      <input
        ref={inputRef}
        type="file"
        accept={ACCEPT}
        className={styles.hidden}
        data-testid="upload-input"
        onChange={onChange}
      />
      <PlanActionRow onUpload={pickFile} uploadDisabled={busy} />
      {error && (
        <p className={styles.error} role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
