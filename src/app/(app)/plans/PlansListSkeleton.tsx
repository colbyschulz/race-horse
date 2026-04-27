import { Skeleton } from "@/components/skeletons/Skeleton";

export function PlansListSkeleton() {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-3)" }}>
      <Skeleton height={88} borderRadius="var(--radius-lg)" />
      <Skeleton height={88} borderRadius="var(--radius-lg)" />
      <Skeleton height={88} borderRadius="var(--radius-lg)" />
    </div>
  );
}
