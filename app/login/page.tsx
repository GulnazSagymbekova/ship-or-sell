import { Suspense } from "react";
import { AppShell, PageTitle } from "@/components/AppShell";
import { LoginForm } from "@/components/LoginForm";
import { LoadingState } from "@/components/LoadingState";

export default function LoginPage() {
  return (
    <AppShell>
      <PageTitle title="Sign in" subtitle="We'll email you a magic link. No password needed." />
      <Suspense fallback={<LoadingState rows={1} />}>
        <LoginForm />
      </Suspense>
    </AppShell>
  );
}
