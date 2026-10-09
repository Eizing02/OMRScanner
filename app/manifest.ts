import type { MetadataRoute } from "next";
import { appBrand } from "@/lib/app-brand";

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "ScanSob · สแกนสอบ",
    short_name: appBrand.name,
    description: "ออกแบบ พิมพ์ และตรวจสอบกระดาษคำตอบสำหรับครูไทย",
    lang: "th",
    start_url: "/dashboard",
    scope: "/",
    display: "standalone",
    background_color: "#f6f8fc",
    theme_color: "#defcf9",
    icons: [
      {
        src: appBrand.logo,
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: appBrand.icon512,
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      {
        src: appBrand.maskableIcon,
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
