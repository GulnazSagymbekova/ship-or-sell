import { AppShell, PageTitle } from "@/components/AppShell";

// Placeholder so the A1 flow has somewhere to land. The real review screen is A2.
export default function ReviewPage() {
  return (
    <AppShell>
      <PageTitle title="Review items" subtitle="Coming next: edit, add and confirm items before we calculate." />
    </AppShell>
  );
}
