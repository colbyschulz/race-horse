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
      { url: "/splash/iphone-se.png",        media: "(device-width: 320px) and (device-height: 568px) and (-webkit-device-pixel-ratio: 2) and (orientation: portrait)" },
      { url: "/splash/iphone-se-2.png",      media: "(device-width: 375px) and (device-height: 667px) and (-webkit-device-pixel-ratio: 2) and (orientation: portrait)" },
      { url: "/splash/iphone-mini.png",      media: "(device-width: 375px) and (device-height: 812px) and (-webkit-device-pixel-ratio: 3) and (orientation: portrait)" },
      { url: "/splash/iphone-14.png",        media: "(device-width: 390px) and (device-height: 844px) and (-webkit-device-pixel-ratio: 3) and (orientation: portrait)" },
      { url: "/splash/iphone-15-pro.png",    media: "(device-width: 393px) and (device-height: 852px) and (-webkit-device-pixel-ratio: 3) and (orientation: portrait)" },
      { url: "/splash/iphone-16pro.png",     media: "(device-width: 402px) and (device-height: 874px) and (-webkit-device-pixel-ratio: 3) and (orientation: portrait)" },
      { url: "/splash/iphone-14-plus.png",   media: "(device-width: 428px) and (device-height: 926px) and (-webkit-device-pixel-ratio: 3) and (orientation: portrait)" },
      { url: "/splash/iphone-14promax.png",  media: "(device-width: 430px) and (device-height: 932px) and (-webkit-device-pixel-ratio: 3) and (orientation: portrait)" },
      { url: "/splash/iphone-16promax.png",  media: "(device-width: 440px) and (device-height: 956px) and (-webkit-device-pixel-ratio: 3) and (orientation: portrait)" },
      { url: "/splash/ipad.png",             media: "(device-width: 768px) and (device-height: 1024px) and (-webkit-device-pixel-ratio: 2) and (orientation: portrait)" },
      { url: "/splash/ipad-pro-11.png",      media: "(device-width: 834px) and (device-height: 1194px) and (-webkit-device-pixel-ratio: 2) and (orientation: portrait)" },
      { url: "/splash/ipad-pro-129.png",     media: "(device-width: 1024px) and (device-height: 1366px) and (-webkit-device-pixel-ratio: 2) and (orientation: portrait)" },
    ],
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#f5f0e8",
  colorScheme: "light",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" style={{ backgroundColor: "#f5f0e8" }}>
      <head>
        <style>{`html,body{background-color:#f5f0e8}`}</style>
      </head>
      <body style={{ backgroundColor: "#f5f0e8" }}>
        {children}
        <ServiceWorkerRegistration />
      </body>
    </html>
  );
}
