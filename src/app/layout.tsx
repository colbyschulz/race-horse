import type { Metadata, Viewport } from "next";
import "@/styles/globals.scss";
import { ServiceWorkerRegistration } from "@/components/service-worker-registration";

export const metadata: Metadata = {
  title: "Race Horse",
  description: "Virtual coach for runners and cyclists",
  appleWebApp: {
    capable: true,
    title: "Race Horse",
    statusBarStyle: "default",
    startupImage: [
      {
        url: "/splash/apple-splash-1206x2622.png",
        media:
          "(device-width: 402px) and (device-height: 874px) and (-webkit-device-pixel-ratio: 3)",
      },
    ],
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
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <style>{`html,body{background-color:#f5f0e8}`}</style>
      </head>
      <body style={{ backgroundColor: "#f5f0e8" }}>
        {children}
        <ServiceWorkerRegistration />
      </body>
    </html>
  );
}
