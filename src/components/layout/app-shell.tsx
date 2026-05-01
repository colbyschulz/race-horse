import { NavLinks } from "./nav-links";
import { TabBar } from "./tab-bar";
import { MainContent } from "./main-content";
import styles from "./app-shell.module.scss";

interface AppShellProps {
  userName: string;
  children: React.ReactNode;
}

export function AppShell({ userName, children }: AppShellProps) {
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
