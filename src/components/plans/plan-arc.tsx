"use client";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import styles from "./plan-arc.module.scss";

interface Props {
  notes: string;
}

export function PlanArc({ notes }: Props) {
  const trimmed = notes.trim();
  if (!trimmed) return null;
  return (
    <section className={styles.card}>
      <div className={styles.label}>Plan arc</div>
      <div className={styles.body}>
        <ReactMarkdown remarkPlugins={[remarkGfm]}>{trimmed}</ReactMarkdown>
      </div>
    </section>
  );
}
