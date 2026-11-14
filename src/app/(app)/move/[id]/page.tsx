import { Suspense } from "react";
import { AppShell } from "@/components/AppShell";
import { LoadingState } from "@/components/LoadingState";
import { MoveScreen } from "@/components/MoveScreen";

export default function MovePage() {
  return (
    <AppShell>
      <Suspense fallback={<LoadingState rows={3} />}>
        <MoveScreen />
      </Suspense>
    </AppShell>
  );
}
