import type { ComponentPropsWithoutRef } from "react";
import styles from "./Textarea.module.scss";

export function Textarea({ className, ...props }: ComponentPropsWithoutRef<"textarea">) {
  return (
    <textarea
      className={`${styles.textarea}${className ? ` ${className}` : ""}`}
      {...props}
    />
  );
}
