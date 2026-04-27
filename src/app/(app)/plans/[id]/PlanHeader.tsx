"use client";
import { useRouter } from "next/navigation";
import { useState, useTransition, useEffect, useRef } from "react";
import styles from "./PlanDetail.module.scss";

function fmtDate(iso: string): string {
  return new Date(iso + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function formatDateRange(start: string, end: string | null): string {
  if (!end) return `${fmtDate(start)} · ongoing`;
  return `${fmtDate(start)} – ${fmtDate(end)}`;
}

function statusOf(plan: { is_active: boolean; start_date: string }, today: string): "active" | "upcoming" | "archived" {
  if (plan.is_active) return "active";
  if (plan.start_date > today) return "upcoming";
  return "archived";
}

interface PlanLike {
  id: string;
  title: string;
  sport: string;
  start_date: string;
  end_date: string | null;
  mode: string;
  is_active: boolean;
}

interface Props {
  plan: PlanLike;
  today: string;
}

export function PlanHeader({ plan, today }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [busy, setBusy] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const status = statusOf(plan, today);

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    }
    if (menuOpen) document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, [menuOpen]);

  async function patch(body: Record<string, unknown>) {
    setMenuOpen(false);
    setBusy(true);
    try {
      const res = await fetch(`/api/plans/${plan.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error(`PATCH failed: ${res.status}`);
      startTransition(() => router.refresh());
    } catch (err) {
      console.error(err);
      alert("Action failed — please try again.");
    } finally {
      setBusy(false);
    }
  }

  async function destroy() {
    setMenuOpen(false);
    if (!confirm(`Delete "${plan.title}"? This cannot be undone.`)) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/plans/${plan.id}`, { method: "DELETE" });
      if (!res.ok) throw new Error(`DELETE failed: ${res.status}`);
      router.push("/plans");
    } catch (err) {
      console.error(err);
      alert("Delete failed — please try again.");
      setBusy(false);
    }
  }

  const disabled = busy || pending;

  return (
    <header className={styles.header}>
      <div className={styles.headerTop}>
        <div className={styles.titleBlock}>
          <h1 className={styles.title}>{plan.title}</h1>
          <p className={styles.subline}>
            {plan.sport} · {formatDateRange(plan.start_date, plan.end_date)} · {plan.mode}
          </p>
        </div>
        <div className={styles.headerRight}>
          <span className={`${styles.statusBadge} ${styles[`status_${status}`]}`}>
            {status === "active" ? "Active" : status === "upcoming" ? "Upcoming" : "Archived"}
          </span>
          <div className={styles.dotMenu} ref={menuRef}>
            <button
              type="button"
              className={styles.dotMenuBtn}
              disabled={disabled}
              aria-label="Plan actions"
              onClick={() => setMenuOpen((o) => !o)}
            >
              •••
            </button>
            {menuOpen && (
              <div className={styles.dotMenuDropdown}>
                {status !== "active" && (
                  <button type="button" className={styles.menuItem} onClick={() => patch({ is_active: true })}>
                    Set active
                  </button>
                )}
                {status === "active" && (
                  <button type="button" className={styles.menuItem} onClick={() => patch({ is_active: false })}>
                    Archive
                  </button>
                )}
                <button type="button" className={`${styles.menuItem} ${styles.menuItemDanger}`} onClick={destroy}>
                  Delete
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </header>
  );
}
