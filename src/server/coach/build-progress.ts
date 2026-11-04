export type BuildProgress = { week: number; total: number };

type ContentLike = { type: string; name?: string; input?: unknown };
type MessageLike = { role: string; content: unknown };

function fromInput(input: unknown): BuildProgress | null {
  const i = input as { week_number?: unknown; total_weeks?: unknown } | null;
  if (typeof i?.week_number !== "number" || typeof i?.total_weeks !== "number") return null;
  return { week: i.week_number, total: i.total_weeks };
}

/** Adds one `update_workouts` input to what's known so far. Rewriting an earlier week doesn't move it back. */
export function mergeBuildProgress(current: BuildProgress | null, input: unknown): BuildProgress | null {
  const next = fromInput(input);
  if (!next) return current;
  return { week: Math.max(current?.week ?? 0, next.week), total: next.total };
}

/** How far a build has written, from the week numbers on its `update_workouts` calls. */
export function latestBuildProgress(messages: MessageLike[]): BuildProgress | null {
  let progress: BuildProgress | null = null;
  for (const message of messages) {
    if (message.role !== "assistant" || !Array.isArray(message.content)) continue;
    for (const block of message.content as ContentLike[]) {
      if (block.type === "tool_use" && block.name === "update_workouts") {
        progress = mergeBuildProgress(progress, block.input);
      }
    }
  }
  return progress;
}

/**
 * True when a build has more weeks to write, such as at a check-in. Finalizing
 * then would mark the plan finished and take the next message out of build mode.
 */
export function isBuildUnfinished(progress: BuildProgress | null): boolean {
  return progress != null && progress.week < progress.total;
}
