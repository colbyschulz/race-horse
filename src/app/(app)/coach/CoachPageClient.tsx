"use client";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import styles from "./Coach.module.scss";
import type { StoredMessage, SSEEvent } from "@/coach/types";
import { consumeStream } from "@/lib/sse";
import type { BuildFormInput } from "@/coach/buildForm";

import { Button } from "@/components/Button";
import { ContextPill } from "@/components/coach/ContextPill";
import { MessageBubble } from "@/components/coach/MessageBubble";
import { ToolIndicator } from "@/components/coach/ToolIndicator";
import { ThinkingIndicator } from "@/components/coach/ThinkingIndicator";
import { MessageInput } from "@/components/coach/MessageInput";
import { ClearChatDialog } from "@/components/coach/ClearChatDialog";
import { BuildFormCard, type BuildFormCardState } from "@/components/coach/BuildFormCard";

interface Props {
  initialMessages: StoredMessage[];
  fromRoute?: string;
  fromLabel?: string;
  planId?: string | null;
  planFileId?: string;
  intent?: string;
}

type StreamingState = {
  text: string;
  tools: { name: string; summary?: string }[];
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
  }, [messages, streaming?.text]);

  async function reloadHistory() {
    const qs = planId ? `?plan_id=${encodeURIComponent(planId)}` : "";
    const r = await fetch(`/api/coach/messages${qs}`);
    if (r.ok) {
      const { messages: m } = (await r.json()) as { messages: StoredMessage[] };
      // Batch both updates so streaming bubble never disappears before the real message appears.
      setMessages(m);
    }
    setStreaming(null);
  }

  function handleSSE(
    ev: SSEEvent,
    assembled: { text: string; tools: { name: string; summary?: string }[] }
  ): void {
    if (ev.type === "text-delta") {
      assembled.text += ev.delta;
      setStreaming({ text: assembled.text, tools: [...assembled.tools], done: false });
    } else if (ev.type === "tool-use") {
      assembled.tools.push({ name: ev.name });
      setStreaming({ text: assembled.text, tools: [...assembled.tools], done: false });
    } else if (ev.type === "tool-result") {
      const last = assembled.tools.findLast((t) => t.name === ev.name && !t.summary);
      if (last) last.summary = ev.result_summary;
      setStreaming({ text: assembled.text, tools: [...assembled.tools], done: false });
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
    setStreaming({ text: "", tools: [], done: false });
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
      const assembled = { text: "", tools: [] as { name: string; summary?: string }[] };
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
    setStreaming({ text: "", tools: [], done: false });
    try {
      const res = await fetch("/api/coach/build", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(values),
      });
      const assembled = { text: "", tools: [] as { name: string; summary?: string }[] };
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
      <header className={styles.header}>
        <h1 className={styles.title}>Coach</h1>
        <Button variant="ghost" size="sm" onClick={() => setClearOpen(true)}>
          Clear chat
        </Button>
      </header>
      <div className={styles.stream} ref={streamRef}>
        {messages.map((m) => (
          <MessageBubble key={m.id} message={m} />
        ))}
        {buildState && (
          <BuildFormCard state={buildState} onSubmit={buildSubmit} onCancel={buildCancel} />
        )}
        {streaming && (
          <>
            {streaming.tools.map((t, i) => (
              <ToolIndicator key={i} name={t.name} summary={t.summary} />
            ))}
            {streaming.text && (
              <MessageBubble
                streaming
                message={{
                  id: "streaming",
                  role: "assistant",
                  plan_id: planId ?? null,
                  created_at: new Date(),
                  content: [{ type: "text", text: streaming.text }],
                }}
              />
            )}
            {/* Working-indicator persists across turn boundaries so the user
                always knows the run is still in flight. Hidden when a tool
                is in-flight (its pulsing dot is the indicator) or when done. */}
            {!streaming.done &&
              (streaming.tools.length === 0 ||
                streaming.tools[streaming.tools.length - 1].summary !== undefined) && (
                <ThinkingIndicator />
              )}
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
