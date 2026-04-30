// Re-exports of cross-boundary types so client code never imports from @/server/.
export type {
  UserPreferences,
  Goal,
  TargetIntensity,
  IntervalSpec,
} from "@/server/db/schema";
