"use client";

import { CSRSuspense } from "@/lib/csr-suspense";
import { SettingsForm } from "./settings-form";
import { Button } from "@/components/button/button";
import { signOutAction } from "@/app/_actions/sign-out";
import { PageHeader } from "@/components/layout/page-header";
import { SettingsFormSkeleton } from "@/components/skeletons/settings-form-skeleton";
import styles from "./settings.module.scss";

export default function SettingsPage() {
  return (
    <div className={styles.page}>
      <PageHeader title="Settings" />
      <div className={styles.scrollArea}>
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
