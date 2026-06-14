import type { Metadata } from "next";
import { ClerkProvider } from "@clerk/nextjs";
import { HeaderAuth } from "@/components/HeaderAuth";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  title: "Zytherion Esports",
  description: "India's most trusted BGMI esports and scrim platform",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <ClerkProvider>
      <html lang="en">
        <body className="bg-cyber-bg text-white antialiased">
          <header className="sticky top-0 z-30 bg-cyber-bg/90 backdrop-blur border-b border-white/5">
            <div className="mx-auto max-w-6xl px-4 h-14 flex items-center justify-between gap-4">
              <div className="flex items-center gap-6">
                <Link
                  href="/dashboard"
                  className="text-base font-black tracking-tight text-gradient-cyber hover:opacity-80 transition-opacity"
                >
                  ZYTHERION
                </Link>
                <nav className="hidden sm:flex items-center gap-1">
                  <Link
                    href="/dashboard"
                    className="px-3 py-1.5 text-sm text-slate-400 hover:text-white hover:bg-white/5 rounded-lg transition-all"
                  >
                    Dashboard
                  </Link>
                </nav>
              </div>
              <nav className="flex items-center gap-1">
                <HeaderAuth />
              </nav>
            </div>
          </header>
          {children}
        </body>
      </html>
    </ClerkProvider>
  );
}
