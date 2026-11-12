import type { TurnExpectation } from "@/lib/coach-activity";
import styles from "./thinking-indicator.module.scss";

// Shown for the kinds of turn known to be long. Kept to one short line.
const EXPECTATION_HINTS: Record<TurnExpectation, string> = {
  plan: "Writing a full plan takes a few minutes.",
  deep: "This is a bigger change, so it can take a few minutes.",
};

interface Props {
  /** What the coach is doing, in a word. */
  label?: string;
  /**
   * A step is on screen with its own pulsing dot and label ("Reading your
   * plan…"), which already says what's happening, so the dots and label here
   * step aside and only one thing moves.
   */
  stepShowing?: boolean;
  /** Set when the turn is one of the kinds known to take a while. */
  expectation?: TurnExpectation | null;
}

/** The line at the foot of a turn in progress: that the coach is still going. */
export function ThinkingIndicator({ label = "Thinking", stepShowing = false, expectation }: Props) {
  const hint = expectation ? EXPECTATION_HINTS[expectation] : null;
  if (stepShowing && !hint) return null;

  return (
    <div className={styles.status} role="status">
      {!stepShowing && (
        <div className={styles.row}>
          <span className={styles.dots} aria-hidden="true">
            <span className={styles.dot} />
            <span className={styles.dot} />
            <span className={styles.dot} />
          </span>
          <span className={styles.label}>{label}</span>
        </div>
      )}
      {hint && <p className={styles.hint}>{hint}</p>}
    </div>
  );
}
