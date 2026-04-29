"use client";
import { useState } from "react";
import { Button } from "@/components/Button";
import { Textarea } from "@/components/Textarea";
import styles from "./CoachNotesEditor.module.scss";

export function CoachNotesEditor({ initialContent }: { initialContent: string }) {
  const [content, setContent] = useState(initialContent);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<Date | null>(null);

  async function save() {
    setSaving(true);
    try {
      const res = await fetch("/api/coach/notes", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ content }),
      });
      if (!res.ok) throw new Error(`save failed: ${res.status}`);
      setSavedAt(new Date());
    } catch (err) {
      console.error(err);
      alert("Save failed.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className={styles.section}>
      <h3 className={styles.title}>Coach notes</h3>
      <p className={styles.help}>The coach&apos;s durable memory about you. The coach edits this automatically as your goals shift, but you can also edit directly. Max 4 KB.</p>
      <Textarea
        value={content}
        onChange={(e) => setContent(e.target.value.slice(0, 4096))}
        rows={10}
      />
      <div className={styles.row}>
        <span className={styles.counter}>{content.length} / 4096</span>
        <span className={styles.spacer} />
        {savedAt && <span className={styles.saved}>Saved {savedAt.toLocaleTimeString()}</span>}
        <Button variant="primary" onClick={save} loading={saving}>Save</Button>
      </div>
    </section>
  );
}
