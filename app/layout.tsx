import type { Metadata } from "next";
import "@fontsource/noto-sans-thai/400.css";
import "@fontsource/noto-sans-thai/500.css";
import "@fontsource/noto-sans-thai/600.css";
import "@fontsource/noto-sans-thai/700.css";
import "./globals.css";
import { WorkspaceProvider } from "@/components/layout/workspace-provider";
import { MainShell } from "@/components/layout/main-shell";
import { AuthProvider } from "@/components/layout/auth-provider";
export const metadata: Metadata = {
  title: "Smart Answer Sheet · พื้นที่ทำงานของครู",
  description: "ออกแบบ พิมพ์ และตรวจสอบกระดาษคำตอบสำหรับครูไทย",
};
export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="th">
      <body>
        <AuthProvider><WorkspaceProvider>
          <MainShell>{children}</MainShell>
        </WorkspaceProvider></AuthProvider>
      </body>
    </html>
  );
}
