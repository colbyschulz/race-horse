"use client";
import { useState, type KeyboardEvent } from "react";

function lockScroll() { window.scrollTo(0, 0); }

function onFocusLock() {
  window.addEventListener("scroll", lockScroll);
}
function onBlurUnlock() {
  window.removeEventListener("scroll", lockScroll);
}
import { Button } from "@/components/button/button";
import styles from "./message-input.module.scss";

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
        onFocus={onFocusLock}
        onBlur={onBlurUnlock}
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
