import Link from "next/link";
import styles from "./EmptyState.module.scss";

interface Props {
  title: string;
  body: string;
  variant?: "bordered" | "tinted";
  size?: "lg" | "sm";
  action?: { label: string; href: string };
}

export function EmptyState({ title, body, variant = "bordered", size = "lg", action }: Props) {
  return (
    <div className={`${styles.root} ${styles[`variant_${variant}`]} ${styles[`size_${size}`]}`}>
      <h2 className={styles.title}>{title}</h2>
      <p className={styles.body}>{body}</p>
      {action && (
        <Link href={action.href} className={styles.cta}>
          {action.label}
        </Link>
      )}
    </div>
  );
}
