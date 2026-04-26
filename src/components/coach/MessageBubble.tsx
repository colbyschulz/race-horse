"use client";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import styles from "./MessageBubble.module.scss";
import type { StoredMessage } from "@/coach/types";

function stripContext(text: string): string {
  return text.replace(/^<context>[\s\S]*?<\/context>\s*/, "");
}

export function MessageBubble({ message }: { message: StoredMessage }) {
  const text = message.content
    .filter((b) => b.type === "text")
    .map((b) => (b as { type: "text"; text: string }).text)
    .join("\n\n");
  const displayText = message.role === "user" ? stripContext(text) : text;
  if (!displayText.trim()) return null;
  return (
    <div className={message.role === "user" ? styles.user : styles.assistant}>
      <div className={styles.bubble}>
        {message.role === "assistant"
          ? <ReactMarkdown remarkPlugins={[remarkGfm]}>{displayText}</ReactMarkdown>
          : <p className={styles.userText}>{displayText}</p>
        }
      </div>
    </div>
  );
}
