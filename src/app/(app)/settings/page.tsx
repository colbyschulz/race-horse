import { CSRSuspense } from "@/lib/csr-suspense";
import { SettingsForm } from "./settings-form";
import { Button } from "@/components/button/button";
import { signOutAction } from "@/app/_actions/sign-out";
import { PageHeader } from "@/components/layout/page-header";
import { SettingsFormSkeleton } from "@/components/skeletons/settings-form-skeleton";
import { InstallTip } from "@/components/install-tip/install-tip";
import styles from "./settings.module.scss";

// A static shell: the data comes from React Query on the client, so switching
// to this tab never waits on the server.
export default function SettingsPage() {
  return (
    <div className={styles.page}>
      <PageHeader title="Settings" />
      <div className={styles.scrollArea}>
        <InstallTip />
        <CSRSuspense fallback={<SettingsFormSkeleton />}>
          <SettingsForm />
        </CSRSuspense>
        <form action={signOutAction} className={styles.signOut}>
          <Button type="submit" variant="danger">
            Log out
          </Button>
        </form>
      </div>
    </div>
  );
}
