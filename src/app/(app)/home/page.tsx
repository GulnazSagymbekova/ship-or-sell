import { AppShell, PageTitle } from "@/components/AppShell";
import { HomeList } from "@/components/HomeList";

export default function HomesPage() {
  return (
    <AppShell>
      <PageTitle title="Home inventory" subtitle="What you own, for insurance." />
      <HomeList />
    </AppShell>
  );
}
