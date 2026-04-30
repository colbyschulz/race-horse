import { auth } from "@/server/auth";
import { NavLinks } from "./nav-links";
import { TabBar } from "./tab-bar";
import { MainContent } from "./main-content";
import styles from "./app-shell.module.scss";

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
      <MainContent>{children}</MainContent>
      <TabBar />
    </div>
  );
}
