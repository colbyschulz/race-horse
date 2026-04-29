import { Skeleton } from "@/components/skeletons/Skeleton";

export function MessagesSkeleton() {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: "var(--space-3)",
        padding: "var(--space-4)",
      }}
    >
      <div style={{ display: "flex", justifyContent: "flex-end" }}>
        <Skeleton width="60%" height={44} borderRadius="var(--radius-lg)" />
      </div>
      <div style={{ display: "flex", justifyContent: "flex-start" }}>
        <Skeleton width="75%" height={72} borderRadius="var(--radius-lg)" />
      </div>
      <div style={{ display: "flex", justifyContent: "flex-end" }}>
        <Skeleton width="45%" height={44} borderRadius="var(--radius-lg)" />
      </div>
      <div style={{ display: "flex", justifyContent: "flex-start" }}>
        <Skeleton width="70%" height={56} borderRadius="var(--radius-lg)" />
      </div>
    </div>
  );
}
