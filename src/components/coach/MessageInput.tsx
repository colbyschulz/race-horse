"use client";
import { useState, type KeyboardEvent } from "react";
import { Button } from "@/components/Button";
import styles from "./MessageInput.module.scss";

export function MessageInput({
  disabled,
  onSend,
}: {
  disabled?: boolean;
  onSend: (text: string) => void;
}) {
  const [value, setValue] = useState("");
  function send() {
    const t = value.trim();
    if (!t || disabled) return;
    onSend(t);
    setValue("");
  }
  function onKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  }
  return (
    <div className={styles.row}>
      <textarea
        className={styles.input}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={onKeyDown}
        placeholder="Ask the coach…"
        rows={2}
        disabled={disabled}
      />
      <Button
        variant="primary"
        disabled={disabled || !value.trim()}
        onClick={send}
        className={styles.send}
      >
        Send
      </Button>
    </div>
  );
}
