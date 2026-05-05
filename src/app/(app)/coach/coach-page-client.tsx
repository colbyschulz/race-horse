"use client";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import styles from "./coach.module.scss";
import type { StoredMessage, SSEEvent } from "@/types/coach";
import { consumeStream } from "@/lib/sse";
import type { BuildFormInput } from "@/lib/build-form";

import { Button } from "@/components/button/button";
import { PageHeader } from "@/components/layout/page-header";
import { ContextPill } from "@/components/coach/context-pill";
import { MessageBubble } from "@/components/coach/message-bubble";
import { ToolIndicator } from "@/components/coach/tool-indicator";
import { ThinkingIndicator } from "@/components/coach/thinking-indicator";
import { MessageInput } from "@/components/coach/message-input";
import { ClearChatDialog } from "@/components/coach/clear-chat-dialog";
import { BuildFormCard, type BuildFormCardState } from "@/components/coach/build-form-card";
import { usePreferences } from "@/queries/preferences";

interface Props {
  initialMessages: StoredMessage[];
  fromRoute?: string;
  fromLabel?: string;
  planId?: string | null;
  planFileId?: string;
  intent?: string;
}

type StreamItem =
  | { kind: "text"; text: string }
  | { kind: "tool"; name: string; summary?: string };

type StreamingState = {
  items: StreamItem[];
  done: boolean;
};

export function CoachPageClient({
  initialMessages,
  fromRoute,
  fromLabel,
  planId,
  planFileId,
  intent,
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

  const [buildState, setBuildState] = useState<BuildFormCardState | null>(
    intent === "build" ? { kind: "editable" } : null
  );

  useEffect(() => {
    const el = streamRef.current;
    if (!el) return;
    function onScroll() {
      const el = streamRef.current;
      if (!el) return;
      pinnedRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
    }
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => el.removeEventListener("scroll", onScroll);
  }, []);

  // useLayoutEffect fires before paint — scroll is set before the browser draws the frame,
  // eliminating the visual jump caused by a post-paint scroll correction.
  useLayoutEffect(() => {
    if (!pinnedRef.current) return;
    const el = streamRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [messages, streaming?.items]);

  async function reloadHistory() {
    const qs = planId ? `?plan_id=${encodeURIComponent(planId)}` : "";
    const r = await fetch(`/api/coach/messages${qs}`);
    if (r.ok) {
      const { messages: m } = (await r.json()) as { messages: StoredMessage[] };
      // Batch both updates so streaming bubble never disappears before the real message appears.
      setMessages(m);
    }
    // Coach turns can create plans, edit workouts, or update notes — invalidate
    // anything plan-shaped so the rest of the app picks up the new state.
    void queryClient.invalidateQueries({ queryKey: ["plans"] });
    void queryClient.invalidateQueries({ queryKey: ["coach", "notes"] });
    setStreaming(null);
  }

  function handleSSE(ev: SSEEvent, assembled: { items: StreamItem[] }): void {
    if (ev.type === "text-delta") {
      const last = assembled.items[assembled.items.length - 1];
      if (last && last.kind === "text") {
        last.text += ev.delta;
      } else {
        assembled.items.push({ kind: "text", text: ev.delta });
      }
      setStreaming({ items: [...assembled.items], done: false });
    } else if (ev.type === "tool-use") {
      assembled.items.push({ kind: "tool", name: ev.name });
      setStreaming({ items: [...assembled.items], done: false });
    } else if (ev.type === "tool-result") {
      const last = assembled.items.findLast(
        (t): t is Extract<StreamItem, { kind: "tool" }> =>
          t.kind === "tool" && t.name === ev.name && !t.summary
      );
      if (last) last.summary = ev.result_summary;
      setStreaming({ items: [...assembled.items], done: false });
    } else if (ev.type === "done") {
      // Mark done immediately so the working-indicator hides before reloadHistory resolves.
      setStreaming((s) => (s ? { ...s, done: true } : s));
      void reloadHistory();
    } else if (ev.type === "error") {
      throw new Error(ev.error);
    }
  }

  async function send(text: string) {
    pinnedRef.current = true;
    setSending(true);
    setMessages((prev) => [
      ...prev,
      {
        id: `tmp-${Date.now()}`,
        role: "user",
        plan_id: planId ?? null,
        created_at: new Date(),
        content: [{ type: "text", text }],
      },
    ]);
    setStreaming({ items: [], done: false });
    try {
      const res = await fetch("/api/coach/chat", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          message: text,
          from_route: fromRoute,
          plan_file_id: planFileId ?? undefined,
          plan_id: planId ?? null,
        }),
      });
      const assembled = { items: [] as StreamItem[] };
      await consumeStream(res, (ev) => handleSSE(ev, assembled));
    } catch (err) {
      console.error(err);
      alert("Coach error — please try again.");
      setStreaming(null); // reloadHistory won't run on error, so clear here
    } finally {
      setSending(false);
    }
  }

  async function buildSubmit(values: BuildFormInput) {
    setSending(true);
    setBuildState({ kind: "submitting", values });
    setStreaming({ items: [], done: false });
    try {
      const res = await fetch("/api/coach/build", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(values),
      });
      const assembled = { items: [] as StreamItem[] };
      let lockedYet = false;
      await consumeStream(res, (ev) => {
        if (!lockedYet && ev.type === "text-delta") {
          lockedYet = true;
          setBuildState({ kind: "locked", values });
        }
        handleSSE(ev, assembled);
      });
      setBuildState(null);
      window.history.replaceState(null, "", "/coach");
    } catch (err) {
      console.error(err);
      alert("Coach error — please try again.");
      setBuildState(null);
      setStreaming(null); // reloadHistory won't run on error, so clear here
    } finally {
      setSending(false);
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
      <div className={styles.stream} ref={streamRef}>
        {messages.map((m) => (
          <MessageBubble key={m.id} message={m} />
        ))}
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
                <ToolIndicator key={i} name={item.name} summary={item.summary} />
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
            {/* Working-indicator persists across turn boundaries so the user
                always knows the run is still in flight. Hidden when a tool
                is in-flight (its pulsing dot is the indicator) or when done. */}
            {!streaming.done &&
              (() => {
                const lastTool = streaming.items.findLast((x) => x.kind === "tool");
                return !lastTool || lastTool.summary !== undefined;
              })() && <ThinkingIndicator />}
          </>
        )}
      </div>
      <MessageInput
        disabled={sending || buildState?.kind === "editable" || buildState?.kind === "submitting"}
        onSend={send}
      />
      <ClearChatDialog open={clearOpen} onClose={() => setClearOpen(false)} onConfirm={clear} />
    </div>
  );
}
