"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import styles from "./Coach.module.scss";
import type { StoredMessage, SSEEvent } from "@/coach/types";
import type { BuildFormInput } from "@/coach/buildForm";

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

type StreamingState = { text: string; tools: { name: string; summary?: string }[] };

async function consumeStream(
  res: Response,
  onEvent: (ev: SSEEvent) => void,
): Promise<void> {
  if (!res.ok || !res.body) throw new Error(`stream failed: ${res.status}`);
  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let buf = "";
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    let idx;
    while ((idx = buf.indexOf("\n\n")) !== -1) {
      const block = buf.slice(0, idx);
      buf = buf.slice(idx + 2);
      const dataLine = block.split("\n").find((l) => l.startsWith("data: "));
      if (!dataLine) continue;
      onEvent(JSON.parse(dataLine.slice(6)) as SSEEvent);
    }
  }
}

export function CoachPageClient({ initialMessages, fromRoute, fromLabel, planId, planFileId, intent }: Props) {
  const router = useRouter();
  const [messages, setMessages] = useState<StoredMessage[]>(initialMessages);
  const [streaming, setStreaming] = useState<StreamingState | null>(null);
  const [sending, setSending] = useState(false);
  const [clearOpen, setClearOpen] = useState(false);
  const streamRef = useRef<HTMLDivElement>(null);

  const [buildState, setBuildState] = useState<BuildFormCardState | null>(
    intent === "build" ? { kind: "editable" } : null,
  );

  useEffect(() => {
    const el = streamRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [messages, streaming?.text]);

  async function reloadHistory() {
    const qs = planId ? `?plan_id=${encodeURIComponent(planId)}` : "";
    const r = await fetch(`/api/coach/messages${qs}`);
    if (r.ok) {
      const { messages: m } = (await r.json()) as { messages: StoredMessage[] };
      setMessages(m);
    }
  }

  function handleSSE(
    ev: SSEEvent,
    assembled: { text: string; tools: { name: string; summary?: string }[] },
  ): void {
    if (ev.type === "text-delta") {
      assembled.text += ev.delta;
      setStreaming({ text: assembled.text, tools: [...assembled.tools] });
    } else if (ev.type === "tool-use") {
      assembled.tools.push({ name: ev.name });
      setStreaming({ text: assembled.text, tools: [...assembled.tools] });
    } else if (ev.type === "tool-result") {
      const last = assembled.tools.findLast((t) => t.name === ev.name && !t.summary);
      if (last) last.summary = ev.result_summary;
      setStreaming({ text: assembled.text, tools: [...assembled.tools] });
    } else if (ev.type === "done") {
      void reloadHistory();
    } else if (ev.type === "error") {
      throw new Error(ev.error);
    }
  }

  async function send(text: string) {
    setSending(true);
    setMessages((prev) => [
      ...prev,
      { id: `tmp-${Date.now()}`, role: "user", plan_id: planId ?? null, created_at: new Date(), content: [{ type: "text", text }] },
    ]);
    setStreaming({ text: "", tools: [] });
    try {
      const res = await fetch("/api/coach/chat", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ message: text, from_route: fromRoute, plan_file_id: planFileId ?? undefined, plan_id: planId ?? null }),
      });
      const assembled = { text: "", tools: [] as { name: string; summary?: string }[] };
      await consumeStream(res, (ev) => handleSSE(ev, assembled));
    } catch (err) {
      console.error(err);
      alert("Coach error — please try again.");
    } finally {
      setStreaming(null);
      setSending(false);
    }
  }

  async function buildSubmit(values: BuildFormInput) {
    setSending(true);
    setBuildState({ kind: "submitting", values });
    setStreaming({ text: "", tools: [] });
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
    } finally {
      setStreaming(null);
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
        <button className={styles.clearBtn} onClick={() => setClearOpen(true)}>Clear chat</button>
      </header>
      <div className={styles.stream} ref={streamRef}>
        {messages.map((m) => <MessageBubble key={m.id} message={m} />)}
        {buildState && (
          <BuildFormCard state={buildState} onSubmit={buildSubmit} onCancel={buildCancel} />
        )}
        {streaming && (
          <>
            {!streaming.text && streaming.tools.length === 0 && <ThinkingIndicator />}
            {streaming.text && <MessageBubble message={{ id: "streaming", role: "assistant", plan_id: planId ?? null, created_at: new Date(), content: [{ type: "text", text: streaming.text }] }} />}
            {streaming.tools.map((t, i) => <ToolIndicator key={i} name={t.name} summary={t.summary} />)}
          </>
        )}
      </div>
      <MessageInput disabled={sending || buildState?.kind === "editable" || buildState?.kind === "submitting"} onSend={send} />
      <ClearChatDialog open={clearOpen} onClose={() => setClearOpen(false)} onConfirm={clear} />
    </div>
  );
}
