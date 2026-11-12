"use client";

import { Button } from "@/components/button/button";
import { promptInstall, useInstallOffer, type InstallOffer } from "@/lib/install";
import styles from "./install-tip.module.scss";

/** The share glyph iOS browsers use, so the tip points at what the athlete will see. */
function ShareIcon() {
  return (
    <svg
      className={styles.icon}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M12 15V3" />
      <path d="M8 7l4-4 4 4" />
      <path d="M6 11H5a1 1 0 0 0-1 1v8a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-8a1 1 0 0 0-1-1h-1" />
    </svg>
  );
}

interface ViewProps {
  offer: InstallOffer;
  onInstall: () => void;
}

/** The tip for a given device. Split out so each device's version can be shown on its own. */
export function InstallTipView({ offer, onInstall }: ViewProps) {
  if (offer === "installed" || offer === "none") return null;

  return (
    <aside className={styles.tip} aria-label="Add to Home Screen">
      {offer === "prompt" && (
        <>
          <p className={styles.text}>Install Race Horse on this device.</p>
          <Button variant="primary" size="sm" onClick={onInstall}>
            Install
          </Button>
        </>
      )}
      {offer === "ios" && (
        <p className={styles.text}>
          To install, tap{" "}
          <span className={styles.together}>
            <ShareIcon />
            <strong>Share</strong>
          </span>
          , then <strong>Add to Home Screen</strong>.
        </p>
      )}
      {offer === "android" && (
        <p className={styles.text}>
          To install, open the browser menu <span aria-hidden="true">⋮</span>, then tap{" "}
          <strong>Add to Home screen</strong>.
        </p>
      )}
    </aside>
  );
}

/** Shown only in a browser tab; once the app runs from the Home Screen it disappears. */
export function InstallTip() {
  const offer = useInstallOffer();
  return <InstallTipView offer={offer} onInstall={() => void promptInstall()} />;
}
