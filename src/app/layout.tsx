import type { Metadata, Viewport } from "next";
import "@/styles/globals.scss";
import { ServiceWorkerRegistration } from "@/components/service-worker-registration";

// Inlined in <head> so the listener exists before the browser starts delivering
// service worker messages. The worker sends this when a launch was painted from
// cache but the server says the session is gone.
const SIGNED_OUT_LISTENER = `if('serviceWorker' in navigator){navigator.serviceWorker.addEventListener('message',function(e){if(e.data&&e.data.type==='rh-signed-out')location.reload()})}`;

export const metadata: Metadata = {
  title: "Race Horse",
  description: "Virtual coach for runners and cyclists",
  appleWebApp: {
    capable: true,
    title: "Race Horse",
    statusBarStyle: "default",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#f5f0e8",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" style={{ backgroundColor: "#f5f0e8" }}>
      <head>
        <style>{`html,body{background-color:#f5f0e8}`}</style>
        <script dangerouslySetInnerHTML={{ __html: SIGNED_OUT_LISTENER }} />
      </head>
      <body style={{ backgroundColor: "#f5f0e8" }}>
        {children}
        <ServiceWorkerRegistration />
      </body>
    </html>
  );
}
