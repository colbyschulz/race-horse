"use client";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import styles from "./MessageBubble.module.scss";
import type { StoredMessage } from "@/coach/types";
import { BUILD_FORM_SENTINEL, parseBuildForm } from "@/coach/buildForm";
import { BuildFormCard } from "./BuildFormCard";

function stripContext(text: string): string {
  return text.replace(/^<context>[\s\S]*?<\/context>\s*/, "");
}

export function MessageBubble({ message, streaming }: { message: StoredMessage; streaming?: boolean }) {
  const text = message.content
    .filter((b) => b.type === "text")
    .map((b) => (b as { type: "text"; text: string }).text)
    .join("\n\n");
  const displayText = message.role === "user" ? stripContext(text) : text;
  if (!displayText.trim()) return null;

  if (message.role === "user" && displayText.trimStart().startsWith(BUILD_FORM_SENTINEL)) {
    const parsed = parseBuildForm(displayText);
    if (parsed) {
      return (
        <BuildFormCard
          state={{ kind: "locked", values: parsed }}
          onSubmit={() => {}}
          onCancel={() => {}}
        />
      );
    }
  }

  return (
    <div className={message.role === "user" ? styles.user : styles.assistant}>
      <div className={styles.bubble}>
        {message.role === "assistant"
          ? streaming
            ? <p className={styles.streamingText}>{displayText}</p>
            : <ReactMarkdown remarkPlugins={[remarkGfm]}>{displayText}</ReactMarkdown>
          : <p className={styles.userText}>{displayText}</p>
        }
      </div>
    </div>
  );
}
