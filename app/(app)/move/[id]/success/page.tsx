import { Suspense } from "react";
import { AppShell } from "@/components/AppShell";
import { LoadingState } from "@/components/LoadingState";
import { SuccessScreen } from "@/components/SuccessScreen";

export default function SuccessPage() {
  return (
    <AppShell>
      <Suspense fallback={<LoadingState rows={3} />}>
        <SuccessScreen />
      </Suspense>
    </AppShell>
  );
}
