import type { ComponentPropsWithoutRef, ElementType } from "react";
import styles from "./card.module.scss";

type Props<T extends ElementType = "div"> = {
  as?: T;
  className?: string;
} & Omit<ComponentPropsWithoutRef<T>, "as" | "className">;

export function Card<T extends ElementType = "div">({ as, className, ...props }: Props<T>) {
  const Tag = as ?? "div";
  return <Tag className={`${styles.card}${className ? ` ${className}` : ""}`} {...props} />;
}
