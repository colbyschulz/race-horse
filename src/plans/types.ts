import type {
  Goal,
  TargetIntensity,
  IntervalSpec,
} from "@/db/schema";

export type Sport = "run" | "bike";
export type PlanMode = "goal" | "indefinite";
export type PlanSource = "uploaded" | "coach_generated";

export type Plan = {
  id: string;
  userId: string;
  title: string;
  sport: Sport;
  mode: PlanMode;
  goal: Goal | null;
  start_date: string; // YYYY-MM-DD
  end_date: string | null;
  is_active: boolean;
  source: PlanSource;
  source_file_id: string | null;
  coach_notes: string;
  created_at: Date;
  updated_at: Date;
};

export type PlanWithCounts = Plan & {
  max_weekly_meters: number;
  longest_run_meters: number;
};

export type CreatePlanInput = {
  title: string;
  sport: Sport;
  mode: PlanMode;
  goal?: Goal;
  start_date: string;
  end_date?: string | null;
  source: PlanSource;
  source_file_id?: string | null;
};

export type { Goal, TargetIntensity, IntervalSpec };
