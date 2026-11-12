"use client";

import { Button } from "@/components/button/button";
import { useSetPlanActive } from "@/queries/plans";
import styles from "./plan-activate-banner.module.scss";

/**
 * Shown on a plan that isn't the active one but could still be followed. Only
 * the active plan appears on Today and Training, which nothing else on the
 * plan page says, so this states it and offers the switch.
 */
export function PlanActivateBanner({ planId }: { planId: string }) {
  const setActive = useSetPlanActive();

  return (
    <div className={styles.banner}>
      <div className={styles.text}>
        <p className={styles.title}>Not on your calendar</p>
        <p className={styles.body}>Today and Training show your active plan.</p>
      </div>
      <Button
        variant="primary"
        disabled={setActive.isPending}
        onClick={() =>
          setActive.mutate(
            { planId, active: true },
            { onError: () => alert("Action failed — please try again.") }
          )
        }
      >
        Make active
      </Button>
    </div>
  );
}
