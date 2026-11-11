"use client";

import { Button } from "@/components/button/button";
import { usePlanIfLoaded, useSetPlanActive } from "@/queries/plans";

/**
 * What the athlete can do with a plan the coach has just finished. A first
 * plan is made active for them. When another plan is still active, this offers
 * the swap as a button, because the new plan won't reach their calendar until
 * they make it.
 */
export function BuiltPlanActions({ planId }: { planId: string }) {
  const { data: plan } = usePlanIfLoaded(planId);
  const setActive = useSetPlanActive();
  const canActivate = plan != null && !plan.is_active && plan.generation_status === "complete";

  return (
    <>
      {canActivate && (
        <Button
          variant="primary"
          size="sm"
          disabled={setActive.isPending}
          onClick={() =>
            setActive.mutate(
              { planId, active: true },
              { onError: () => alert("Couldn't make the plan active. Please try again.") }
            )
          }
        >
          Make this my active plan
        </Button>
      )}
      <Button href={`/plans/${planId}`} variant={canActivate ? "ghost" : "primary"} size="sm">
        View your plan →
      </Button>
    </>
  );
}
