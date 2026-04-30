// Re-exports of cross-boundary plan types so client code never imports from @/server/.
export type {
  Sport,
  PlanMode,
  PlanSource,
  PlanGenerationStatus,
  Plan,
  PlanWithCounts,
  CreatePlanInput,
} from "@/server/plans/types";

export type { WorkoutRow, PlanRow } from "@/server/plans/date-queries";
