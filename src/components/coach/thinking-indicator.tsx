"use client";

import { useEffect, useState } from "react";
import type { TurnExpectation } from "@/lib/coach-activity";
import styles from "./thinking-indicator.module.scss";

// Shown for the kinds of turn known to be long. Kept to one short line.
const EXPECTATION_HINTS: Record<TurnExpectation, string> = {
  plan: "Writing a full plan takes a few minutes.",
  deep: "This is a bigger change, so it can take a few minutes.",
};

export function formatElapsed(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

function useElapsedSeconds(startedAt: number | null | undefined): number | null {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (startedAt == null) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [startedAt]);
  if (startedAt == null) return null;
  return Math.max(0, Math.floor((now - startedAt) / 1000));
}

interface Props {
  /** What the coach is doing, in a word or two. */
  label?: string;
  /** Hidden while a step shows its own pulsing dot, so only one thing moves. */
  dots?: boolean;
  /** When the turn began (ms since epoch). Shows a running clock when set. */
  startedAt?: number | null;
  /** Set when the turn is one of the kinds known to take a while. */
  expectation?: TurnExpectation | null;
}

/** The line at the foot of a turn in progress: what's happening and for how long. */
export function ThinkingIndicator({
  label = "Thinking",
  dots = true,
  startedAt,
  expectation,
}: Props) {
  const elapsed = useElapsedSeconds(startedAt);
  const hint = expectation ? EXPECTATION_HINTS[expectation] : null;

  return (
    <div className={styles.status} role="status">
      <div className={styles.row}>
        {dots && (
          <span className={styles.dots} aria-hidden="true">
            <span className={styles.dot} />
            <span className={styles.dot} />
            <span className={styles.dot} />
          </span>
        )}
        <span className={styles.label}>{label}</span>
        {elapsed != null && (
          // Hidden from screen readers: a clock ticking every second is noise.
          <span className={styles.elapsed} aria-hidden="true">
            {formatElapsed(elapsed)}
          </span>
        )}
      </div>
      {hint && <p className={styles.hint}>{hint}</p>}
    </div>
  );
}
