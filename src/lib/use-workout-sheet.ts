"use client";

import { useState } from "react";
import type { WorkoutRow } from "@/types/plans";

/**
 * State machine for the workout-detail slide-up sheet. The caller passes its
 * map/list of workouts; this hook tracks which date is currently open and
 * exposes the resolved workout + open/close handlers.
 */
export function useWorkoutSheet(lookup: (date: string) => WorkoutRow | undefined) {
  const [openDate, setOpenDate] = useState<string | null>(null);
  const openWorkout = openDate ? (lookup(openDate) ?? null) : null;
  return {
    openWorkout,
    open: setOpenDate,
    close: () => setOpenDate(null),
  };
}
