"use client";

import { Button } from "@/components/Button";

export default function Error({
  error,
  reset,
}: {
  error: Error;
  reset: () => void;
}) {
  return (
    <main
      style={{
        padding: "var(--space-8)",
        textAlign: "center",
        fontFamily: "var(--font-body)",
      }}
    >
      <h2
        style={{
          fontFamily: "var(--font-display)",
          fontSize: "1.25rem",
          marginBottom: "var(--space-3)",
        }}
      >
        Something went wrong
      </h2>
      <p style={{ color: "var(--color-fg-secondary)", marginBottom: "var(--space-6)" }}>
        {error.message}
      </p>
      <Button variant="primary" onClick={reset}>
        Try again
      </Button>
    </main>
  );
}
