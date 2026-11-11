import type { Metadata, Viewport } from "next";
import { Roboto, Syne } from "next/font/google";
import "@/styles/globals.scss";
import { ServiceWorkerRegistration } from "@/components/service-worker-registration";
import { APP_BACKGROUND } from "@/lib/theme";

// Self-hosted at build time, so the first paint never waits on Google's servers
// and the service worker can cache the font files with the rest of the build.
// Both are variable fonts: one file each covers every weight the app uses.
const syne = Syne({ subsets: ["latin"], variable: "--font-syne", display: "swap" });
const roboto = Roboto({ subsets: ["latin"], variable: "--font-roboto", display: "swap" });

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
  themeColor: APP_BACKGROUND,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="en"
      className={`${syne.variable} ${roboto.variable}`}
      // Set inline so the page is already the right colour before the
      // stylesheet arrives.
      style={{ backgroundColor: APP_BACKGROUND }}
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: SIGNED_OUT_LISTENER }} />
      </head>
      <body>
        {children}
        <ServiceWorkerRegistration />
      </body>
    </html>
  );
}
