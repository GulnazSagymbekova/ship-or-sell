import { AppShell, PageTitle } from "@/components/AppShell";
import { MoveList } from "@/components/MoveList";

export default function MovesPage() {
  return (
    <AppShell>
      <PageTitle title="My moves" />
      <MoveList />
    </AppShell>
  );
}
