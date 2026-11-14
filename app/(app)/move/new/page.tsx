import { AppShell, PageTitle } from "@/components/AppShell";
import { MoveForm } from "@/components/MoveForm";

export default function NewMovePage() {
  return (
    <AppShell>
      <PageTitle title="Your move" subtitle="Four quick questions so we can price shipping vs. selling." />
      <MoveForm />
    </AppShell>
  );
}
