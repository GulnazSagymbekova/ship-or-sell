import { Suspense } from "react";
import { AppShell } from "@/components/AppShell";
import { LoadingState } from "@/components/LoadingState";
import { ReviewScreen } from "@/components/ReviewScreen";

export default function ReviewPage() {
  return (
    <AppShell>
      <Suspense fallback={<LoadingState rows={3} />}>
        <ReviewScreen />
      </Suspense>
    </AppShell>
  );
}
