export type PlanStatus = "generating" | "active" | "inactive" | "archived";

export const PLAN_STATUS_LABEL: Record<PlanStatus, string> = {
  active: "Active",
  generating: "In progress",
  inactive: "Not active",
  archived: "Archived",
};

/**
 * Where a plan stands for the athlete. Only one plan is active at a time, and
 * only the active plan appears on Today and Training. A plan that isn't active
 * is "archived" once its end date has passed; until then it is simply not
 * active, whether it starts next week or was set aside mid-block.
 */
export function planStatus(
  plan: {
    is_active: boolean;
    end_date: string | null;
    generation_status?: "generating" | "complete";
  },
  today: string
): PlanStatus {
  if (plan.generation_status === "generating") return "generating";
  if (plan.is_active) return "active";
  if (plan.end_date != null && plan.end_date < today) return "archived";
  return "inactive";
}
