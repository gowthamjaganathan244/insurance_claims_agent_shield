import type { Metadata, Viewport } from "next";
import { DynamicIsland } from "@/components/dynamic-island";
import { ClaimProvider } from "@/components/claim-store";
import { MotionPreferences } from "@/components/motion";
import "./globals.css";
export const metadata: Metadata = {
  title: {
    default: "Command | AgentShield AU",
    template: "%s | AgentShield AU",
  },
  description:
    "AgentShield AU — claims operations, security investigations, reliability and customer communications.",
  robots: { index: false, follow: false },
};
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#111214",
  colorScheme: "dark",
};
export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en-AU">
      <body>
        <div id="bg" aria-hidden="true">
          <i />
          <i />
          <i />
        </div>
        <a className="skip" href="#app">
          Skip to content
        </a>
        <ClaimProvider>
          <DynamicIsland />
          {children}
        </ClaimProvider>
        <MotionPreferences />
      </body>
    </html>
  );
}
