"use client";

import { use } from "react";
import { notFound, useSearchParams } from "next/navigation";
import { CSRSuspense } from "@/lib/csr-suspense";
import { todayIso } from "@/lib/dates";
import { ReviewClient } from "./review-client";
import { usePreferences } from "@/queries/preferences";
import { useActivePlan } from "@/queries/plans";
import { usePlanFile } from "@/queries/plan-files";
import { ReviewSkeleton } from "@/components/skeletons/review-skeleton";

interface PageProps {
  params: Promise<{ id: string }>;
}

export default function ReviewPage({ params }: PageProps) {
  const { id } = use(params);
  return (
    <CSRSuspense fallback={<ReviewSkeleton />}>
      <ReviewContent id={id} />
    </CSRSuspense>
  );
}

function ReviewContent({ id }: { id: string }) {
  const searchParams = useSearchParams();
  const isRetry = searchParams.get("retry") === "1";

  const { data: prefs } = usePreferences();
  const { data: file } = usePlanFile(id);
  const { data: activePlan } = useActivePlan();

  if (!file) notFound();

  return (
    <ReviewClient
      initialFile={{
        id: file.id,
        status: file.status,
        original_filename: file.original_filename,
        extraction_error: file.extraction_error,
        extracted_payload: file.extracted_payload,
      }}
      units={prefs.units}
      today={todayIso(prefs.timezone)}
      hasActivePlan={activePlan !== null}
      isRetry={isRetry}
    />
  );
}
