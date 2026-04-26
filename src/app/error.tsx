"use client";

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
      <button
        onClick={reset}
        style={{
          padding: "var(--space-2) var(--space-4)",
          borderRadius: "var(--radius-md)",
          border: "none",
          background: "var(--color-brown)",
          color: "#ffffff",
          fontFamily: "var(--font-body)",
          fontWeight: 500,
          cursor: "pointer",
        }}
      >
        Try again
      </button>
    </main>
  );
}
