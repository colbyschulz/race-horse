import type { MetadataRoute } from "next";
import { APP_BACKGROUND } from "@/lib/theme";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Race Horse",
    short_name: "Race Horse",
    description: "Virtual coach for runners and cyclists",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: APP_BACKGROUND,
    theme_color: APP_BACKGROUND,
    categories: ["health", "fitness", "sports"],
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
  };
}
