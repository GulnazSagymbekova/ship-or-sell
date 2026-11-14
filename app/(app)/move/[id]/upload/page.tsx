import { Suspense } from "react";
import { AppShell } from "@/components/AppShell";
import { LoadingState } from "@/components/LoadingState";
import { UploadScreen } from "@/components/UploadScreen";

export default function UploadPage() {
  return (
    <AppShell>
      <Suspense fallback={<LoadingState rows={2} />}>
        <UploadScreen />
      </Suspense>
    </AppShell>
  );
}
