import styles from "./Spinner.module.scss";

interface Props {
  size?: "sm" | "md";
  className?: string;
  style?: React.CSSProperties;
}

export function Spinner({ size = "sm", className, style }: Props) {
  return (
    <span
      className={`${styles.spinner} ${styles[`size_${size}`]}${className ? ` ${className}` : ""}`}
      style={style}
      aria-hidden="true"
    />
  );
}
