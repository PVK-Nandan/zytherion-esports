import type { Metadata } from "next";
import { ClerkProvider } from "@clerk/nextjs";
import { AppShell } from "@/components/layout/AppShell";
import "./globals.css";

export const metadata: Metadata = {
  title: "Zytherion Esports",
  description: "India's most trusted BGMI esports and scrim platform",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <ClerkProvider>
      <html lang="en">
        <body className="bg-cyber-bg text-slate-200 antialiased">
          <AppShell>{children}</AppShell>
        </body>
      </html>
    </ClerkProvider>
  );
}
