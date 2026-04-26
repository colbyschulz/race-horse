import { auth } from "@/auth";
import { NavLinks } from "./NavLinks";
import styles from "./AppShell.module.scss";

export async function AppShell({ children }: { children: React.ReactNode }) {
  const session = await auth();
  const userName = session?.user?.name ?? "";

  return (
    <div className={styles.shell}>
      <aside className={styles.sidebar}>
        <div>
          <div className={styles.brand}>Race Horse</div>
          {userName && <div className={styles.userLabel}>{userName}</div>}
        </div>
        <NavLinks variant="sidebar" />
      </aside>
      <main className={styles.main}>{children}</main>
      <div className={styles.tabBar}>
        <NavLinks variant="tabs" />
      </div>
    </div>
  );
}
