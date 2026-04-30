"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import styles from "./app-shell.module.scss";

const LINKS = [
  { href: "/today", label: "Today" },
  { href: "/training", label: "Training" },
  { href: "/plans", label: "Plans" },
  { href: "/settings", label: "Settings" },
] as const;

export function NavLinks({ variant }: { variant: "tabs" | "sidebar" }) {
  const pathname = usePathname();
  return (
    <nav className={variant === "tabs" ? styles.tabs : styles.sidebarNav}>
      {LINKS.map((link) => {
        const active = pathname.startsWith(link.href);
        return (
          <Link
            key={link.href}
            href={link.href}
            className={active ? styles.linkActive : styles.link}
          >
            {link.label}
          </Link>
        );
      })}
    </nav>
  );
}
