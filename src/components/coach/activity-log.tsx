import styles from "./activity-log.module.scss";
import { ProgressNote, ToolIndicator } from "./tool-indicator";
import type { ActivityStep } from "@/lib/coach-activity";

/** The steps behind a reply, collapsed once the coach has moved on. */
export function ActivityLog({ steps, open }: { steps: ActivityStep[]; open?: boolean }) {
  const toolCount = steps.filter((s) => s.kind === "tool").length;
  const count = toolCount || steps.length;
  return (
    <details className={styles.log} open={open}>
      <summary className={styles.summary}>
        {count} {count === 1 ? "step" : "steps"}
      </summary>
      <div className={styles.steps}>
        {steps.map((step, i) =>
          step.kind === "tool" ? (
            <ToolIndicator key={i} label={step.label} summary={step.label} />
          ) : (
            <ProgressNote key={i} text={step.text} />
          )
        )}
      </div>
    </details>
  );
}
