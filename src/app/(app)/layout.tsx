import { SyncStatusBanner } from "@/components/sync-status-banner/sync-status-banner";
import { AppShell } from "@/components/layout/app-shell";
import { PreferencesCapture } from "@/components/preferences-capture";
import { QueryProvider } from "@/lib/query-client";

// Deliberately reads nothing about the request, so the tab pages under it are
// static and a tab switch never waits on the server. Signed-out visitors are
// turned away by the proxy; a session that turns out to be dead is caught by
// the first API call (see the 401 handling in QueryProvider) and by the pages
// that still render on the server.
export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <QueryProvider>
      <PreferencesCapture />
      <SyncStatusBanner />
      <AppShell>{children}</AppShell>
    </QueryProvider>
  );
}
