import styles from "./Badge.module.scss";

type Variant = "active" | "upcoming" | "archived" | "generating";

interface Props {
  variant: Variant;
  label: string;
  className?: string;
}

export function Badge({ variant, label, className }: Props) {
  return (
    <span className={`${styles.badge} ${styles[`badge_${variant}`]}${className ? ` ${className}` : ""}`}>
      {label}
    </span>
  );
}
