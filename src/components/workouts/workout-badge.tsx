import styles from "./workout-badge.module.scss";

export type WorkoutType =
  | "easy"
  | "long"
  | "tempo"
  | "threshold"
  | "intervals"
  | "recovery"
  | "race"
  | "rest"
  | "cross";

const LABELS: Record<WorkoutType, string> = {
  easy: "Easy",
  long: "Long",
  tempo: "Tempo",
  threshold: "Threshold",
  intervals: "Intervals",
  recovery: "Recovery",
  race: "Race",
  rest: "Rest",
  cross: "Cross",
};

interface Props {
  type: WorkoutType;
  size?: "sm" | "md";
}

export function WorkoutBadge({ type, size = "md" }: Props) {
  return <span className={`${styles.badge} ${styles[type]} ${styles[size]}`}>{LABELS[type]}</span>;
}
