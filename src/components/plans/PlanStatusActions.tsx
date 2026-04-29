"use client";
import { useRouter } from "next/navigation";
import { useState, useTransition, useEffect, useRef } from "react";
import { Button } from "@/components/Button";
import { Badge } from "@/components/Badge";
import styles from "./PlanStatusActions.module.scss";

type Status = "active" | "upcoming" | "archived";

function statusOf(plan: { is_active: boolean; start_date: string }, today: string): Status {
  if (plan.is_active) return "active";
  if (plan.start_date > today) return "upcoming";
  return "archived";
}

interface Props {
  plan: { id: string; title: string; is_active: boolean; start_date: string };
  today: string;
}

export function PlanStatusActions({ plan, today }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [busy, setBusy] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const status = statusOf(plan, today);

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    }
    if (menuOpen) document.addEventListener("mousedown", onClickOutside);
    else setConfirmDelete(false);
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
      if (body.is_active === false) {
        router.push("/plans");
      } else {
        startTransition(() => router.refresh());
      }
    } catch (err) {
      console.error(err);
      alert("Action failed — please try again.");
    } finally {
      setBusy(false);
    }
  }

  async function destroy() {
    setBusy(true);
    setMenuOpen(false);
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
    <>
      <Badge
        variant={status}
        label={status === "active" ? "Active" : status === "upcoming" ? "Upcoming" : "Archived"}
      />
      <div className={styles.menu} ref={menuRef}>
        <Button
          variant="ghost"
          size="sm"
          disabled={disabled}
          aria-label="Plan actions"
          onClick={() => setMenuOpen((o) => !o)}
        >
          •••
        </Button>
        {menuOpen && (
          <div className={styles.dropdown}>
            {status !== "active" && (
              <button
                type="button"
                className={styles.item}
                onClick={() => patch({ is_active: true })}
              >
                Set active
              </button>
            )}
            {status === "active" && (
              <button
                type="button"
                className={styles.item}
                onClick={() => patch({ is_active: false })}
              >
                Archive
              </button>
            )}
            {confirmDelete ? (
              <div className={styles.confirmRow}>
                <span className={styles.confirmLabel}>Delete?</span>
                <Button variant="danger" size="sm" onClick={destroy}>
                  Yes
                </Button>
                <Button variant="ghost" size="sm" onClick={() => setConfirmDelete(false)}>
                  No
                </Button>
              </div>
            ) : (
              <button
                type="button"
                className={`${styles.item} ${styles.itemDanger}`}
                onClick={() => setConfirmDelete(true)}
              >
                Delete
              </button>
            )}
          </div>
        )}
      </div>
    </>
  );
}
