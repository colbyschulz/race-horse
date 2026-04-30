import type { ComponentPropsWithoutRef } from "react";
import styles from "./input.module.scss";

export function Input({ className, ...props }: ComponentPropsWithoutRef<"input">) {
  return <input className={`${styles.input}${className ? ` ${className}` : ""}`} {...props} />;
}
