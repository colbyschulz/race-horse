import { NavLinks } from "./nav-links";
import { TabBar } from "./tab-bar";
import { MainContent } from "./main-content";
import { UserLabel } from "./user-label";
import styles from "./app-shell.module.scss";

export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <div className={styles.shell}>
      <aside className={styles.sidebar}>
        <div>
          <div className={styles.brand}>Race Horse</div>
          <UserLabel />
        </div>
        <NavLinks variant="sidebar" />
      </aside>
      <MainContent>{children}</MainContent>
      <TabBar />
    </div>
  );
}
