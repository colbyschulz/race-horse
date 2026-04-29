"use client";
import { useState } from "react";
import { mondayOf, addDays } from "./dates";
import { planNavBounds } from "./planNav";

export function usePlanWeekNav(startDate: string, endDate: string | null) {
  const [monday, setMonday] = useState(() => mondayOf(startDate));
  const bounds = planNavBounds(startDate, endDate, monday);
  return {
    monday,
    ...bounds,
    goToPrev: () => !bounds.prevDisabled && setMonday(addDays(monday, -7)),
    goToNext: () => !bounds.nextDisabled && setMonday(addDays(monday, 7)),
  };
}
