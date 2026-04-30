import type { CSSProperties } from "react";
import styles from "./skeleton.module.scss";

interface Props {
  width?: string | number;
  height?: string | number;
  borderRadius?: string;
  className?: string;
  style?: CSSProperties;
}

export function Skeleton({
  width = "100%",
  height = 16,
  borderRadius = "var(--radius-sm)",
  className,
  style,
}: Props) {
  return (
    <div
      aria-hidden="true"
      className={`${styles.skeleton}${className ? ` ${className}` : ""}`}
      style={{ width, height, borderRadius, ...style }}
    />
  );
}
