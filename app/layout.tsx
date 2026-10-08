import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "AgentShield AU · Claims Security",
  description: "Insurance claims security and operational resilience.",
  other: {
    "codex-preview": "development",
  },
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased">{children}</body>
    </html>
  );
}
