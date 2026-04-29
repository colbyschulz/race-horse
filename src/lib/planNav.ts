import { mondayOf, addDays } from "./dates";

export interface PlanNavBounds {
  firstMonday: string;
  lastMonday: string | null;
  prevDisabled: boolean;
  nextDisabled: boolean;
  insidePlan: boolean;
}

export function planNavBounds(
  startDate: string,
  endDate: string | null,
  monday: string,
): PlanNavBounds {
  const firstMonday = mondayOf(startDate);
  const lastMonday = endDate ? mondayOf(addDays(endDate, -1)) : null;
  return {
    firstMonday,
    lastMonday,
    prevDisabled: monday <= firstMonday,
    nextDisabled: !!lastMonday && monday >= lastMonday,
    insidePlan: monday >= firstMonday && (lastMonday == null || monday <= lastMonday),
  };
}
