import { Skeleton } from "@/components/skeletons/Skeleton";

export function WeekAgendaSkeleton() {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-4)", padding: "var(--space-4) 0" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <Skeleton width={140} height={20} />
        <div style={{ display: "flex", gap: "var(--space-2)" }}>
          <Skeleton width={32} height={32} borderRadius="var(--radius-md)" />
          <Skeleton width={32} height={32} borderRadius="var(--radius-md)" />
          <Skeleton width={56} height={32} borderRadius="var(--radius-md)" />
        </div>
      </div>
      {Array.from({ length: 7 }).map((_, i) => (
        <Skeleton key={i} height={52} borderRadius="var(--radius-md)" />
      ))}
    </div>
  );
}
