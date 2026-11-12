// Remembers, per plan, that this device has seen the coach building it. Once
// the plan is complete its conversation offers a way to view it and make it
// active, and keeps offering until the athlete takes it or the conversation
// moves on. It is kept in localStorage because a build runs for minutes, and a
// phone may close the app in the background before it finishes.

const key = (planId: string) => `coachBuiltPlanOffer:${planId}`;

export function rememberBuild(planId: string): void {
  try {
    localStorage.setItem(key(planId), "1");
  } catch {
    /* storage unavailable — the plan is still reachable from the plans list */
  }
}

export function hasBuiltPlanOffer(planId: string): boolean {
  try {
    return localStorage.getItem(key(planId)) !== null;
  } catch {
    return false;
  }
}

export function dismissBuiltPlanOffer(planId: string): void {
  try {
    localStorage.removeItem(key(planId));
  } catch {
    /* ignore */
  }
}
