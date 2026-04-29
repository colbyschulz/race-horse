"use client";

import { Button } from "@/components/Button";

export default function GlobalError({ error, reset }: { error: Error; reset: () => void }) {
  return (
    <html>
      <body>
        <main
          style={{
            padding: "var(--space-8)",
            textAlign: "center",
            minHeight: "100vh",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            fontFamily: "var(--font-body)",
            background: "var(--color-bg-base)",
            color: "var(--color-fg-primary)",
          }}
        >
          <h1
            style={{
              fontFamily: "var(--font-display)",
              fontSize: "1.5rem",
              marginBottom: "var(--space-3)",
            }}
          >
            Something went wrong
          </h1>
          <p style={{ color: "var(--color-fg-secondary)", marginBottom: "var(--space-6)" }}>
            {error.message}
          </p>
          <Button variant="primary" onClick={reset}>
            Try again
          </Button>
        </main>
      </body>
    </html>
  );
}
