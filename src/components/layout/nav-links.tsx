"use client";

import Link, { useLinkStatus } from "next/link";
import { usePathname } from "next/navigation";
import styles from "./app-shell.module.scss";

const LINKS = [
  { href: "/today", label: "Today" },
  { href: "/training", label: "Training" },
  { href: "/plans", label: "Plans" },
  { href: "/settings", label: "Settings" },
] as const;

/** Exact route or a sub-route of it — never a mere prefix of another route. */
export function isActiveRoute(pathname: string | null, href: string): boolean {
  if (!pathname) return false;
  return pathname === href || pathname.startsWith(`${href}/`);
}

function NavLinkLabel({ label }: { label: string }) {
  const { pending } = useLinkStatus();
  return <span className={pending ? styles.linkLabelPending : undefined}>{label}</span>;
}

export function NavLinks({ variant }: { variant: "tabs" | "sidebar" }) {
  const pathname = usePathname();
  // Exactly one link can be active; resolve it once rather than per-link so
  // the sidebar and tab bar can never disagree or light two at once.
  const activeHref = LINKS.find((l) => isActiveRoute(pathname, l.href))?.href ?? null;
  return (
    <nav className={variant === "tabs" ? styles.tabs : styles.sidebarNav}>
      {LINKS.map((link) => {
        const active = link.href === activeHref;
        return (
          <Link
            key={link.href}
            href={link.href}
            className={active ? styles.linkActive : styles.link}
            aria-current={active ? "page" : undefined}
          >
            <NavLinkLabel label={link.label} />
          </Link>
        );
      })}
    </nav>
  );
}
