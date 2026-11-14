import { AppShell, PageTitle } from "@/components/AppShell";

// Placeholder: final privacy text will be provided by the team (A3).
export default function PrivacyPage() {
  return (
    <AppShell>
      <PageTitle title="Privacy" />
      <div className="space-y-3 text-sm text-muted-foreground">
        <p>We remove location data (EXIF/GPS) from every photo you upload.</p>
        <p>Photos are stored privately and are only shown to you through short-lived links.</p>
        <p>You can delete your move, items and photos at any time.</p>
        <p className="italic">Full privacy policy coming soon.</p>
      </div>
    </AppShell>
  );
}
