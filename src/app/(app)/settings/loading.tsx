import { PageHeader } from "@/components/layout/page-header";
import { SettingsFormSkeleton } from "@/components/skeletons/settings-form-skeleton";
import styles from "./settings.module.scss";

export default function SettingsLoading() {
  return (
    <div className={styles.page}>
      <PageHeader title="Settings" />
      <SettingsFormSkeleton />
    </div>
  );
}
