export type PlanStatus = "generating" | "active" | "inactive";

export const PLAN_STATUS_LABEL: Record<PlanStatus, string> = {
  active: "Active",
  generating: "In progress",
  inactive: "Inactive",
};

/**
 * Where a plan stands for the athlete. Only one plan is active at a time, and
 * only the active plan appears on Today and Training. Every other finished
 * plan is inactive, whether it starts next week, was set aside mid-block or
 * ended last year: the app stores nothing that tells those apart.
 */
export function planStatus(plan: {
  is_active: boolean;
  generation_status?: "generating" | "complete";
}): PlanStatus {
  if (plan.generation_status === "generating") return "generating";
  return plan.is_active ? "active" : "inactive";
}

/** Whether a plan's last day is behind the athlete. An open-ended plan never ends. */
export function planHasEnded(endDate: string | null, today: string): boolean {
  return endDate != null && endDate < today;
}
