"use client";
import { useRouter } from "next/navigation";
import { useState, useEffect, useRef } from "react";
import { Button } from "@/components/button/button";
import { Badge } from "@/components/badge/badge";
import { PLAN_STATUS_LABEL, planStatus } from "@/lib/plan-status";
import { useSetPlanActive } from "@/queries/plans";
import styles from "./plan-status-actions.module.scss";

interface Props {
  plan: { id: string; title: string; is_active: boolean };
  /** Off when something else on the page already says where the plan stands. */
  showBadge?: boolean;
}

export function PlanStatusActions({ plan, showBadge = true }: Props) {
  const router = useRouter();
  const setPlanActive = useSetPlanActive();
  const [busy, setBusy] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const status = planStatus(plan);

  // Closing the menu also backs out of a half-finished delete confirmation.
  function closeMenu() {
    setMenuOpen(false);
    setConfirmDelete(false);
  }

  useEffect(() => {
    if (!menuOpen) return;
    function onClickOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
        setConfirmDelete(false);
      }
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, [menuOpen]);

  // The page reads the plan from the query cache, which the mutation refreshes.
  async function setActive(active: boolean) {
    closeMenu();
    setBusy(true);
    try {
      await setPlanActive.mutateAsync({ planId: plan.id, active });
      if (!active) router.push("/plans");
    } catch (err) {
      console.error(err);
      alert("Action failed — please try again.");
    } finally {
      setBusy(false);
    }
  }

  async function destroy() {
    setBusy(true);
    closeMenu();
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

  const disabled = busy;

  return (
    <>
      {showBadge && <Badge variant={status} label={PLAN_STATUS_LABEL[status]} />}
      <div className={styles.menu} ref={menuRef}>
        <Button
          variant="ghost"
          size="sm"
          disabled={disabled}
          aria-label="Plan actions"
          onClick={() => (menuOpen ? closeMenu() : setMenuOpen(true))}
        >
          •••
        </Button>
        {menuOpen && (
          <div className={styles.dropdown}>
            <button
              type="button"
              className={styles.item}
              disabled={downloading}
              onClick={async () => {
                setDownloading(true);
                try {
                  const res = await fetch(`/api/plans/${plan.id}/export`);
                  const blob = await res.blob();
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement("a");
                  a.href = url;
                  a.download = `${plan.title.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}.md`;
                  a.click();
                  URL.revokeObjectURL(url);
                } catch {
                  alert("Download failed — please try again.");
                } finally {
                  setDownloading(false);
                  closeMenu();
                }
              }}
            >
              {downloading ? "Downloading…" : "Download"}
            </button>
            {status !== "active" && (
              <button
                type="button"
                className={styles.item}
                onClick={() => setActive(true)}
              >
                Make active
              </button>
            )}
            {status === "active" && (
              <button
                type="button"
                className={styles.item}
                onClick={() => setActive(false)}
              >
                Make inactive
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
