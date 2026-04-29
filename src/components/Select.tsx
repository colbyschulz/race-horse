import type { ComponentPropsWithoutRef } from "react";
import styles from "./Select.module.scss";

export function Select({ className, ...props }: ComponentPropsWithoutRef<"select">) {
  return (
    <select
      className={`${styles.select}${className ? ` ${className}` : ""}`}
      {...props}
    />
  );
}
