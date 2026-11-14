import { Suspense } from "react";
import { AppShell } from "@/components/AppShell";
import { LoadingState } from "@/components/LoadingState";
import { ListingsScreen } from "@/components/ListingsScreen";

export default function ListingsPage() {
  return (
    <AppShell>
      <Suspense fallback={<LoadingState rows={3} />}>
        <ListingsScreen />
      </Suspense>
    </AppShell>
  );
}
