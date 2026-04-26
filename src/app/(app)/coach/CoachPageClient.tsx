"use client";
import { useEffect, useRef, useState } from "react";
import styles from "./Coach.module.scss";
import type { StoredMessage, SSEEvent } from "@/coach/types";

import { ContextPill } from "@/components/coach/ContextPill";
import { MessageBubble } from "@/components/coach/MessageBubble";
import { ToolIndicator } from "@/components/coach/ToolIndicator";
import { MessageInput } from "@/components/coach/MessageInput";
import { ClearChatDialog } from "@/components/coach/ClearChatDialog";

interface Props {
  initialMessages: StoredMessage[];
  fromRoute?: string;
}

export function CoachPageClient({ initialMessages, fromRoute }: Props) {
  const [messages, setMessages] = useState<StoredMessage[]>(initialMessages);
  const [streaming, setStreaming] = useState<{ text: string; tools: { name: string; summary?: string }[] } | null>(null);
  const [sending, setSending] = useState(false);
  const [clearOpen, setClearOpen] = useState(false);
  const streamRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = streamRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [messages, streaming?.text]);

  async function send(text: string) {
    setSending(true);

    const userMsg: StoredMessage = {
      id: `tmp-${Date.now()}`,
      role: "user",
      created_at: new Date(),
      content: [{ type: "text", text }],
    };
    setMessages((prev) => [...prev, userMsg]);
    setStreaming({ text: "", tools: [] });

    try {
      const res = await fetch("/api/coach/chat", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ message: text, from_route: fromRoute }),
      });
      if (!res.ok || !res.body) throw new Error(`chat failed: ${res.status}`);

      const reader = res.body.getReader();
      const dec = new TextDecoder();
      let buf = "";
      let assembledText = "";
      const tools: { name: string; summary?: string }[] = [];

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
          const ev = JSON.parse(dataLine.slice(6)) as SSEEvent;
          if (ev.type === "text-delta") {
            assembledText += ev.delta;
            setStreaming({ text: assembledText, tools: [...tools] });
          } else if (ev.type === "tool-use") {
            tools.push({ name: ev.name });
            setStreaming({ text: assembledText, tools: [...tools] });
          } else if (ev.type === "tool-result") {
            const last = tools.findLast((t) => t.name === ev.name && !t.summary);
            if (last) last.summary = ev.result_summary;
            setStreaming({ text: assembledText, tools: [...tools] });
          } else if (ev.type === "done") {
            const r = await fetch("/api/coach/messages");
            if (r.ok) {
              const { messages: m } = await r.json() as { messages: StoredMessage[] };
              setMessages(m);
            }
          } else if (ev.type === "error") {
            throw new Error(ev.error);
          }
        }
      }
    } catch (err) {
      console.error(err);
      alert("Coach error — please try again.");
    } finally {
      setStreaming(null);
      setSending(false);
    }
  }

  async function clear() {
    await fetch("/api/coach/messages", { method: "DELETE" });
    setMessages([]);
    setClearOpen(false);
  }

  return (
    <div className={styles.page}>
      <ContextPill fromRoute={fromRoute} />
      <header className={styles.header}>
        <h1 className={styles.title}>Coach</h1>
        <button className={styles.clearBtn} onClick={() => setClearOpen(true)}>Clear chat</button>
      </header>
      <div className={styles.stream} ref={streamRef}>
        {messages.map((m) => <MessageBubble key={m.id} message={m} />)}
        {streaming && (
          <>
            {streaming.tools.map((t, i) => <ToolIndicator key={i} name={t.name} summary={t.summary} />)}
            <MessageBubble message={{ id: "streaming", role: "assistant", created_at: new Date(), content: [{ type: "text", text: streaming.text }] }} />
          </>
        )}
      </div>
      <MessageInput disabled={sending} onSend={send} />
      <ClearChatDialog open={clearOpen} onClose={() => setClearOpen(false)} onConfirm={clear} />
    </div>
  );
}
