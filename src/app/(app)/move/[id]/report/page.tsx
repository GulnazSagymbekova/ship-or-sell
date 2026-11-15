import { Suspense } from "react";
import { AppShell } from "@/components/AppShell";
import { LoadingState } from "@/components/LoadingState";
import { ReportScreen } from "@/components/ReportScreen";

export default function ReportPage() {
  return (
    <AppShell width="wide">
      <Suspense fallback={<LoadingState rows={4} />}>
        <ReportScreen />
      </Suspense>
    </AppShell>
  );
}
