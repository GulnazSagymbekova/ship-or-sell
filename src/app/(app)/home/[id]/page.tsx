import { Suspense } from "react";
import { AppShell } from "@/components/AppShell";
import { HomeScreen } from "@/components/HomeScreen";
import { LoadingState } from "@/components/LoadingState";

export default function HomePage() {
  return (
    <AppShell>
      <Suspense fallback={<LoadingState rows={4} />}>
        <HomeScreen />
      </Suspense>
    </AppShell>
  );
}
