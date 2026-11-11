"use client";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import styles from "./coach.module.scss";
import type { StoredMessage, SSEEvent } from "@/types/coach";
import { consumeStream, CoachStreamError } from "@/lib/sse";
import {
  COACH_UNREACHABLE_MESSAGE,
  decideTurnPollOutcome,
  TURN_POLL_INTERVAL_MS,
  type Turn,
} from "@/lib/turn-poll";
import type { BuildFormInput } from "@/lib/build-form";
import {
  buildTimeline,
  describeToolInProgress,
  isStepNarration,
  stepExpectation,
  type TurnExpectation,
} from "@/lib/coach-activity";

import { Button } from "@/components/button/button";
import { PageHeader } from "@/components/layout/page-header";
import { ContextPill } from "@/components/coach/context-pill";
import { MessageBubble } from "@/components/coach/message-bubble";
import { ProgressNote, ToolIndicator } from "@/components/coach/tool-indicator";
import { ActivityLog } from "@/components/coach/activity-log";
import { ThinkingIndicator } from "@/components/coach/thinking-indicator";
import { MessageInput } from "@/components/coach/message-input";
import { ClearChatDialog } from "@/components/coach/clear-chat-dialog";
import { BuildFormCard, type BuildFormCardState } from "@/components/coach/build-form-card";
import { BuiltPlanActions } from "@/components/coach/built-plan-actions";
import { usePreferences } from "@/queries/preferences";

interface Props {
  initialMessages: StoredMessage[];
  fromRoute?: string;
  fromLabel?: string;
  planId?: string | null;
  planFileId?: string;
  intent?: string;
  /** The conversation's plan is still being built, so its writes are many weeks long. */
  planGenerating?: boolean;
}

type StreamItem =
  | { kind: "text"; text: string }
  | { kind: "note"; text: string }
  | {
      kind: "tool";
      id: string;
      label: string;
      summary?: string;
      expectation?: TurnExpectation | null;
    };

// How often a returning athlete's chat picks up new steps, in status checks.
const REFRESH_EVERY_N_POLLS = 2;

type StreamingState = {
  items: StreamItem[];
  done: boolean;
};

// sessionStorage key for a cold-start build's plan id, written as soon as it's
// known (plan-created) so a build interrupted before the URL carries plan_id
// (e.g. the user switches screens mid-build) can still be found again.
export const COACH_BUILD_STASH_KEY = "coachInProgressBuildPlanId";

type TurnStatusResponse = { turn: Turn };

// How long the connection gets to settle before a dropped message is re-sent.
const RESEND_DELAY_MS = 1000;

function whenVisible(): Promise<void> {
  if (document.visibilityState === "visible") return Promise.resolve();
  return new Promise((resolve) => {
    function onChange() {
      if (document.visibilityState !== "visible") return;
      document.removeEventListener("visibilitychange", onChange);
      resolve();
    }
    document.addEventListener("visibilitychange", onChange);
  });
}

/**
 * Starts a coach turn, trying once more if the request is dropped before the
 * server answers. A phone does that to a request in flight when the app goes
 * to the background, and often to the first one after it comes back. If the
 * first attempt did arrive, the server answers the second with 409 and the
 * page follows the turn already under way.
 */
async function postTurn(url: string, body: string, signal: AbortSignal): Promise<Response> {
  const post = () =>
    fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      signal,
      body,
    });
  try {
    return await post();
  } catch (err) {
    if (signal.aborted) throw err;
    console.error(err);
    await whenVisible();
    await new Promise((resolve) => setTimeout(resolve, RESEND_DELAY_MS));
    if (signal.aborted) throw err;
    return post();
  }
}

export function CoachPageClient({
  initialMessages,
  fromRoute,
  fromLabel,
  planId: initialPlanId,
  planFileId,
  intent,
  planGenerating = false,
}: Props) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { data: preferences } = usePreferences();
  const [messages, setMessages] = useState<StoredMessage[]>(initialMessages);
  const [streaming, setStreaming] = useState<StreamingState | null>(null);
  const [sending, setSending] = useState(false);
  const [clearOpen, setClearOpen] = useState(false);
  const streamRef = useRef<HTMLDivElement>(null);
  const pinnedRef = useRef(true);

  // planId can change mid-session: a cold-start build pre-creates a stub plan
  // server-side and emits plan-created over SSE; the URL pivots to /coach?plan_id=NEW
  // so the conversation continues against that plan.
  const [planId, setPlanId] = useState<string | null | undefined>(initialPlanId);

  // Ref tracks the plan_id received mid-stream from plan-created events. Using a ref
  // rather than state means reloadHistory() avoids the stale-closure problem (state
  // updates are async; the ref is available immediately in the same event loop turn).
  // URL update is deferred until after consumeStream so CoachContent never remounts
  // mid-stream (window.history.replaceState triggers useSearchParams re-render).
  const receivedPlanIdRef = useRef<string | null>(null);

  // Set when the plan is actually finalized (plan-finalized SSE event or finalize_plan
  // tool-use seen). Used to gate the "View your plan" CTA so it only appears once
  // the plan has workouts — not after a clarifying-question turn.
  const planFinalizedRef = useRef(false);

  // Tracks the in-flight reloadHistory promise so buildSubmit can await it before
  // calling replaceState — ensuring messages and plan are in the RQ cache before the
  // component remounts, preventing CoachWithPlanLabel from suspending on mount.
  const reloadHistoryPromiseRef = useRef<Promise<void> | null>(null);

  const [buildState, setBuildState] = useState<BuildFormCardState | null>(
    intent === "build" ? { kind: "editable" } : null
  );

  // Set to the plan ID when a build stream completes, to show a "View plan" CTA.
  // sessionStorage carries the value across the component remount that follows
  // window.history.replaceState (which triggers useSearchParams → CoachContent re-render).
  const [viewPlanId, setViewPlanId] = useState<string | null>(null);
  useEffect(() => {
    const id = sessionStorage.getItem("justBuiltPlanId");
    if (id) {
      sessionStorage.removeItem("justBuiltPlanId");
      // sessionStorage doesn't exist while this renders on the server, so the
      // flag can only be picked up after mount; as initial state it would
      // make the server and client markup disagree.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setViewPlanId(id);
    }
  }, []);

  // True while a mount-time poll has found a turn still running server-side
  // (e.g. the user navigated away or closed the app mid-reply and came back).
  const [turnInFlight, setTurnInFlight] = useState(false);

  // When the turn in progress began, for the running clock under it.
  const [turnStartedAt, setTurnStartedAt] = useState<number | null>(null);

  // True until the first turn-status check resolves. Input stays disabled
  // through this window too — otherwise a message sent in the single
  // round-trip before we know a turn is already running would race it.
  const [checkingTurnStatus, setCheckingTurnStatus] = useState(true);

  // Asks the server where the current turn stands. `watching` means a stream
  // this page was following has gone away, so whatever the turn does next is
  // news. `refresh` means the page just arrived or came back and may be showing
  // out-of-date messages.
  const checkTurnRef = useRef<(opts: { watching: boolean; refresh: boolean }) => void>(() => {});
  const streamActiveRef = useRef(false);
  const streamAbortRef = useRef<AbortController | null>(null);
  const lastAlertRef = useRef<string | null>(null);
  const mountedRef = useRef(false);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  function showAlertOnce(message: string) {
    if (lastAlertRef.current === message) return;
    lastAlertRef.current = message;
    alert(message);
  }

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let observedRunning = false;
    let latestCheck = 0;
    let pollsWhileRunning = 0;

    // A blank build form has no conversation of its own to load.
    const hasHistory = Boolean(planId) || intent !== "build";

    async function poll(refresh: boolean) {
      const check = ++latestCheck;
      if (timer) clearTimeout(timer);
      const qs = planId ? `?plan_id=${encodeURIComponent(planId)}` : "";

      let turn: Turn;
      try {
        const r = await fetch(`/api/coach/turn-status${qs}`);
        if (!r.ok) throw new Error(`turn status failed: ${r.status}`);
        ({ turn } = (await r.json()) as TurnStatusResponse);
      } catch (err) {
        if (cancelled || check !== latestCheck) return;
        console.error(err);
        // Never leave the input locked because a status check failed.
        setCheckingTurnStatus(false);
        if (observedRunning) timer = setTimeout(() => void poll(refresh), TURN_POLL_INTERVAL_MS);
        return;
      }
      if (cancelled || check !== latestCheck) return;

      const outcome = decideTurnPollOutcome(turn, observedRunning, Date.now());
      setCheckingTurnStatus(false);

      const refreshNow = refresh && hasHistory && !streamActiveRef.current;

      if (outcome.kind === "keep-polling") {
        observedRunning = true;
        setTurnInFlight(true);
        // A turn this page started is timed from the send; one found already
        // running is timed from when the server says it began.
        if (!streamActiveRef.current && turn) {
          setTurnStartedAt(new Date(turn.started_at).getTime());
        }
        // Each finished step is saved as it happens, so a returning athlete can
        // follow along even without the live stream.
        pollsWhileRunning += 1;
        if (refreshNow) {
          void reloadHistory();
        } else if (
          hasHistory &&
          !streamActiveRef.current &&
          pollsWhileRunning % REFRESH_EVERY_N_POLLS === 0
        ) {
          void fetchLatestMessages();
        }
        timer = setTimeout(() => void poll(false), TURN_POLL_INTERVAL_MS);
        return;
      }

      setTurnInFlight(false);
      observedRunning = false;
      const turnEnded = outcome.kind === "reload" || outcome.kind === "alert";
      if (turnEnded) streamAbortRef.current?.abort();
      if (turnEnded || refreshNow) void reloadHistory();
      if (outcome.kind === "alert") showAlertOnce(outcome.message);
    }

    checkTurnRef.current = ({ watching, refresh }) => {
      if (watching) observedRunning = true;
      void poll(refresh);
    };

    // An installed app often resumes without remounting, so this page can be
    // left showing an old state unless it checks again on the way back.
    function onResume() {
      if (document.visibilityState === "visible") void poll(true);
    }
    document.addEventListener("visibilitychange", onResume);
    window.addEventListener("pageshow", onResume);
    window.addEventListener("online", onResume);

    void poll(true);
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
      document.removeEventListener("visibilitychange", onResume);
      window.removeEventListener("pageshow", onResume);
      window.removeEventListener("online", onResume);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [planId]);

  // Stay pinned to the newest message unless the user has scrolled up to read.
  function onStreamScroll(e: React.UIEvent<HTMLDivElement>) {
    const el = e.currentTarget;
    pinnedRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
  }

  // useLayoutEffect fires before paint — scroll is set before the browser draws the frame,
  // eliminating the visual jump caused by a post-paint scroll correction.
  useLayoutEffect(() => {
    if (!pinnedRef.current) return;
    const el = streamRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [messages, streaming?.items]);

  async function fetchLatestMessages() {
    // Use ref first: on cold-start builds, plan-created fires before done, and
    // state updates are async so planId state is still null when this runs.
    const effectivePlanId = receivedPlanIdRef.current ?? planId;
    const qs = effectivePlanId ? `?plan_id=${encodeURIComponent(effectivePlanId)}` : "";
    try {
      const r = await fetch(`/api/coach/messages${qs}`);
      if (r.ok) {
        const { messages: m } = (await r.json()) as { messages: StoredMessage[] };
        setMessages(m);
        // Pre-populate RQ cache so the component that remounts after the URL update
        // (window.history.replaceState fires after consumeStream) sees data instantly.
        if (effectivePlanId) {
          queryClient.setQueryData(["coach", "messages", effectivePlanId], m);
        }
      }
    } catch (err) {
      // Offline: keep what's on screen. The next resume or status check retries.
      console.error(err);
    }
  }

  async function reloadHistory() {
    await fetchLatestMessages();
    // Coach turns can create plans, edit workouts, or update notes — invalidate
    // anything plan-shaped so the rest of the app picks up the new state.
    void queryClient.invalidateQueries({ queryKey: ["plans"] });
    // Today and Training read workouts under their own key.
    void queryClient.invalidateQueries({ queryKey: ["workouts"] });
    void queryClient.invalidateQueries({ queryKey: ["coach", "notes"] });
    setStreaming(null);
  }

  function handleSSE(
    ev: SSEEvent,
    assembled: { items: StreamItem[] },
    buildingPlan: boolean
  ): void {
    if (ev.type === "plan-created") {
      receivedPlanIdRef.current = ev.plan_id;
      setPlanId(ev.plan_id);
      // Do NOT call window.history.replaceState here — it triggers useSearchParams()
      // to update, which causes CoachContent to remount CoachPageClient mid-stream.
      // URL is updated after consumeStream resolves (see buildSubmit).
      try {
        sessionStorage.setItem(COACH_BUILD_STASH_KEY, ev.plan_id);
      } catch {
        /* sessionStorage unavailable — reconnect just won't work for this session */
      }
      return;
    }
    if (ev.type === "plan-finalized") {
      // Auto-finalize path: server confirmed the plan has workouts and is complete.
      planFinalizedRef.current = true;
      return;
    }
    if (ev.type === "tool-use" && ev.name === "finalize_plan") {
      // Explicit finalize_plan call by the coach — plan is about to be finalized.
      planFinalizedRef.current = true;
    }
    if (ev.type === "text-delta") {
      const last = assembled.items[assembled.items.length - 1];
      if (last && last.kind === "text") {
        last.text += ev.delta;
      } else {
        assembled.items.push({ kind: "text", text: ev.delta });
      }
      setStreaming({ items: [...assembled.items], done: false });
    } else if (ev.type === "progress-delta") {
      const last = assembled.items[assembled.items.length - 1];
      if (last && last.kind === "note") {
        last.text += ev.delta;
      } else {
        assembled.items.push({ kind: "note", text: ev.delta });
      }
      setStreaming({ items: [...assembled.items], done: false });
    } else if (ev.type === "tool-start") {
      assembled.items.push({
        kind: "tool",
        id: ev.id,
        label: describeToolInProgress(ev.name),
        expectation: stepExpectation(ev.name, undefined, buildingPlan),
      });
      setStreaming({ items: [...assembled.items], done: false });
    } else if (ev.type === "tool-use") {
      const label = describeToolInProgress(ev.name, ev.input);
      const item = assembled.items.find(
        (t): t is Extract<StreamItem, { kind: "tool" }> => t.kind === "tool" && t.id === ev.id
      );
      const expectation = stepExpectation(ev.name, ev.input, buildingPlan);
      if (item) {
        item.label = label;
        item.expectation = expectation;
      } else {
        assembled.items.push({ kind: "tool", id: ev.id, label, expectation });
      }
      setStreaming({ items: [...assembled.items], done: false });
    } else if (ev.type === "tool-result") {
      const item = assembled.items.find(
        (t): t is Extract<StreamItem, { kind: "tool" }> => t.kind === "tool" && t.id === ev.id
      );
      if (item) item.summary = ev.result_summary;
      setStreaming({ items: [...assembled.items], done: false });
    } else if (ev.type === "done") {
      // Mark done immediately so the working-indicator hides before reloadHistory resolves.
      setStreaming((s) => (s ? { ...s, done: true } : s));
      // For continuation turns (send(), not buildSubmit): plan finalized in this
      // stream — show CTA directly since there's no replaceState/remount.
      if (planFinalizedRef.current && !receivedPlanIdRef.current) {
        const effectiveId = planId ?? null;
        if (effectiveId) setViewPlanId(effectiveId);
        planFinalizedRef.current = false;
      }
      reloadHistoryPromiseRef.current = reloadHistory();
    } else if (ev.type === "error") {
      throw new CoachStreamError(ev.error);
    }
  }

  // Returns true when the turn may still be running on the server, in which case
  // the page has switched to checking on it. A dropped connection isn't a failed
  // turn: the server keeps working after the app is backgrounded or closed.
  function recoverFromLostStream(err: unknown, res: Response | undefined): boolean {
    console.error(err);
    setStreaming(null); // reloadHistory won't run on error, so clear here
    if (err instanceof CoachStreamError) {
      showAlertOnce(err.message);
      return false;
    }
    if (res?.status === 409) {
      // An earlier attempt at this message got through and is being answered.
      checkTurnRef.current({ watching: true, refresh: true });
      return true;
    }
    if (!res || !res.ok) {
      if (mountedRef.current) showAlertOnce(COACH_UNREACHABLE_MESSAGE);
      checkTurnRef.current({ watching: false, refresh: true });
      return false;
    }
    checkTurnRef.current({ watching: true, refresh: false });
    return true;
  }

  function beginStream(): AbortController {
    const controller = new AbortController();
    streamAbortRef.current = controller;
    streamActiveRef.current = true;
    lastAlertRef.current = null;
    setTurnStartedAt(Date.now());
    return controller;
  }

  function endStream() {
    streamActiveRef.current = false;
    streamAbortRef.current = null;
  }

  async function send(text: string) {
    pinnedRef.current = true;
    setSending(true);
    const tmpId = `tmp-${Date.now()}`;
    setMessages((prev) => [
      ...prev,
      {
        id: tmpId,
        role: "user",
        plan_id: planId ?? null,
        created_at: new Date(),
        content: [{ type: "text", text }],
      },
    ]);
    setStreaming({ items: [], done: false });
    const controller = beginStream();
    let res: Response | undefined;
    try {
      res = await postTurn(
        "/api/coach/chat",
        JSON.stringify({
          message: text,
          from_route: fromRoute,
          from_label: fromLabel,
          plan_file_id: planFileId ?? undefined,
          plan_id: planId ?? null,
        }),
        controller.signal
      );
      const assembled = { items: [] as StreamItem[] };
      let finished = false;
      await consumeStream(res, (ev) => {
        if (ev.type === "done" || ev.type === "error") finished = true;
        handleSSE(ev, assembled, planGenerating);
      });
      if (!finished) throw new Error("coach stream ended before the turn finished");
    } catch (err) {
      // Aborted means a status check already found this turn over and reloaded.
      if (!controller.signal.aborted) {
        // Nothing was accepted, so take the unsent message back off the screen.
        // (409 means an earlier attempt was accepted; the reload replaces it.)
        if (!res || (!res.ok && res.status !== 409)) {
          setMessages((prev) => prev.filter((m) => m.id !== tmpId));
        }
        recoverFromLostStream(err, res);
      }
    } finally {
      endStream();
      setSending(false);
    }
  }

  async function buildSubmit(values: BuildFormInput) {
    setSending(true);
    setBuildState({ kind: "submitting", values });
    setStreaming({ items: [], done: false });
    const controller = beginStream();
    // The app picks the plan's id so that a build whose request is dropped can
    // be re-sent safely, and found again if the first attempt did arrive.
    const newPlanId = crypto.randomUUID();
    let res: Response | undefined;
    try {
      res = await postTurn(
        "/api/coach/build",
        JSON.stringify({ ...values, plan_id: newPlanId }),
        controller.signal
      );
      const assembled = { items: [] as StreamItem[] };
      let lockedYet = false;
      let finished = false;
      await consumeStream(res, (ev) => {
        if (ev.type === "done" || ev.type === "error") finished = true;
        if (!lockedYet && ev.type === "text-delta") {
          lockedYet = true;
          setBuildState({ kind: "locked", values });
        }
        handleSSE(ev, assembled, true);
      });
      if (!finished) throw new Error("coach stream ended before the turn finished");
      // Wait for reloadHistory to finish so the messages cache is populated before
      // replaceState. Without this, CoachWithMessages suspends on mount because
      // useCoachMessages finds no cache entry for the new plan_id.
      await (reloadHistoryPromiseRef.current ?? Promise.resolve());
      reloadHistoryPromiseRef.current = null;

      if (receivedPlanIdRef.current) {
        // Pre-populate the plan cache so CoachWithPlanLabel's usePlan() doesn't
        // suspend on mount — React 18 keeps stale content visible during a suspended
        // transition, which makes the locked build card appear frozen.
        try {
          const r = await fetch(`/api/plans/${receivedPlanIdRef.current}`);
          if (r.ok) {
            const data = (await r.json()) as { plan: unknown };
            queryClient.setQueryData(["plans", receivedPlanIdRef.current], data.plan);
          }
        } catch {
          /* best-effort */
        }
      }

      // All caches are warm — safe to update the URL now. The remounted component
      // sees data instantly with no loading flash or suspension.
      if (receivedPlanIdRef.current) {
        // Only show the "View your plan" CTA when the plan was actually finalized
        // (plan has workouts). A clarifying-question turn ends the stream too but
        // planFinalizedRef stays false, so the button doesn't appear prematurely.
        if (planFinalizedRef.current) {
          sessionStorage.setItem("justBuiltPlanId", receivedPlanIdRef.current);
          planFinalizedRef.current = false;
        }
        window.history.replaceState(
          null,
          "",
          `/coach?plan_id=${encodeURIComponent(receivedPlanIdRef.current)}`
        );
        receivedPlanIdRef.current = null;
      }
      setBuildState(null);
    } catch (err) {
      if (!controller.signal.aborted && res?.status === 409) {
        // The first attempt arrived and the build is under way. Point the page
        // at its plan; the conversation loads there and follows the build.
        setStreaming(null);
        setBuildState(null);
        window.history.replaceState(null, "", `/coach?plan_id=${encodeURIComponent(newPlanId)}`);
      } else if (!controller.signal.aborted) {
        const stillRunning = recoverFromLostStream(err, res);
        // Nothing reached the server, so keep the form available for a retry.
        setBuildState(!res || !res.ok ? { kind: "editable" } : null);
        if (stillRunning && receivedPlanIdRef.current) {
          // The build carries on under its plan, so point the page at it.
          window.history.replaceState(
            null,
            "",
            `/coach?plan_id=${encodeURIComponent(receivedPlanIdRef.current)}`
          );
          receivedPlanIdRef.current = null;
        }
      } else {
        setBuildState(null);
      }
    } finally {
      endStream();
      setSending(false);
      try {
        sessionStorage.removeItem(COACH_BUILD_STASH_KEY);
      } catch {
        /* ignore */
      }
    }
  }

  function buildCancel() {
    router.push("/plans");
  }

  async function clear() {
    const qs = planId ? `?plan_id=${encodeURIComponent(planId)}` : "";
    await fetch(`/api/coach/messages${qs}`, { method: "DELETE" });
    setMessages([]);
    setClearOpen(false);
  }

  const timeline = useMemo(() => buildTimeline(messages), [messages]);

  // What the line under a turn in progress says. A step being carried out has
  // its own pulsing dot and label, so the line goes quiet apart from the clock.
  const lastItem = streaming?.items.at(-1);
  const steps =
    streaming?.items.filter(
      (x): x is Extract<StreamItem, { kind: "tool" }> => x.kind === "tool"
    ) ?? [];
  const lastStep = steps.at(-1);
  const stepInFlight = lastStep != null && lastStep.summary === undefined;
  const expectation = steps.findLast((s) => s.expectation != null)?.expectation ?? null;

  return (
    <div className={styles.page}>
      <ContextPill fromRoute={fromRoute} fromLabel={fromLabel} />
      <PageHeader
        title="Coach"
        actions={
          <Button variant="ghost" size="sm" onClick={() => setClearOpen(true)}>
            Clear chat
          </Button>
        }
      />
      <div className={styles.stream} ref={streamRef} onScroll={onStreamScroll}>
        {timeline.map((entry, i) =>
          entry.kind === "message" ? (
            <MessageBubble key={entry.message.id} message={entry.message} />
          ) : (
            <ActivityLog
              key={entry.key}
              steps={entry.steps}
              open={turnInFlight && i === timeline.length - 1}
            />
          )
        )}
        {buildState && (
          <BuildFormCard
            state={buildState}
            units={preferences.units}
            onSubmit={buildSubmit}
            onCancel={buildCancel}
          />
        )}
        {streaming && (
          <>
            {streaming.items.map((item, i) =>
              item.kind === "tool" ? (
                <ToolIndicator key={i} label={item.label} summary={item.summary} />
              ) : item.kind === "note" ||
                (isStepNarration(item.text) &&
                  streaming.items.slice(i + 1).some((later) => later.kind === "tool")) ? (
                <ProgressNote key={i} text={item.text} />
              ) : (
                <MessageBubble
                  key={i}
                  streaming
                  message={{
                    id: `streaming-${i}`,
                    role: "assistant",
                    plan_id: planId ?? null,
                    created_at: new Date(),
                    content: [{ type: "text", text: item.text }],
                  }}
                />
              )
            )}
            {/* Stays for the whole turn, across its steps, so the athlete
                always knows the run is still going and for how long. */}
            {!streaming.done && (
              <ThinkingIndicator
                label={stepInFlight || lastItem?.kind === "text" ? "Working" : "Thinking"}
                dots={!stepInFlight}
                startedAt={turnStartedAt}
                expectation={expectation}
              />
            )}
          </>
        )}
        {!streaming && turnInFlight && (
          <ThinkingIndicator label="Working" startedAt={turnStartedAt} />
        )}
      </div>
      {viewPlanId && (
        <div className={styles.viewPlanCta}>
          <BuiltPlanActions planId={viewPlanId} />
        </div>
      )}
      <MessageInput
        disabled={
          sending ||
          turnInFlight ||
          checkingTurnStatus ||
          buildState?.kind === "editable" ||
          buildState?.kind === "submitting"
        }
        onSend={send}
      />
      <ClearChatDialog open={clearOpen} onClose={() => setClearOpen(false)} onConfirm={clear} />
    </div>
  );
}
