import { Suspense } from "react";
import { AppShell } from "@/components/AppShell";
import { LoadingState } from "@/components/LoadingState";
import { ProScreen } from "@/components/ProScreen";

export default function ProPage() {
  return (
    <AppShell>
      <Suspense fallback={<LoadingState rows={4} />}>
        <ProScreen />
      </Suspense>
    </AppShell>
  );
}
