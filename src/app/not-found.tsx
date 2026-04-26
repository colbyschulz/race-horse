import Link from "next/link";

export default function NotFound() {
  return (
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
        Not found
      </h1>
      <p style={{ color: "var(--color-fg-secondary)", marginBottom: "var(--space-6)" }}>
        That page doesn&apos;t exist.
      </p>
      <Link
        href="/today"
        style={{
          padding: "var(--space-3) var(--space-6)",
          borderRadius: "var(--radius-md)",
          background: "var(--color-brown)",
          color: "#ffffff",
          fontFamily: "var(--font-body)",
          fontWeight: 500,
        }}
      >
        Go home
      </Link>
    </main>
  );
}
