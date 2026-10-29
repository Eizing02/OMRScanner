import type { Metadata, Viewport } from "next";
import "@fontsource/noto-sans-thai/400.css";
import "@fontsource/noto-sans-thai/500.css";
import "@fontsource/noto-sans-thai/600.css";
import "@fontsource/noto-sans-thai/700.css";
import "./globals.css";
import { WorkspaceProvider } from "@/components/layout/workspace-provider";
import { MainShell } from "@/components/layout/main-shell";
import { AuthProvider } from "@/components/layout/auth-provider";
import { appBrand } from "@/lib/app-brand";
export const metadata: Metadata = {
  title: "ScanSob · สแกนสอบ",
  applicationName: appBrand.name,
  description: "ออกแบบ พิมพ์ และตรวจสอบกระดาษคำตอบสำหรับครูไทย",
  manifest: "/manifest.webmanifest",
  icons: {
    icon: [{ url: appBrand.favicon, sizes: "32x32", type: "image/png" }],
    apple: [{ url: appBrand.appleIcon, sizes: "180x180", type: "image/png" }],
  },
  appleWebApp: {
    capable: true,
    title: appBrand.name,
    statusBarStyle: "default",
  },
};
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#10243a",
};
export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="th">
      <body>
        <AuthProvider>
          <WorkspaceProvider>
            <MainShell>{children}</MainShell>
          </WorkspaceProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
