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
        <body className="bg-[#0d0f14] text-white antialiased">
          <header className="sticky top-0 z-30 bg-[#0d0f14]/90 backdrop-blur border-b border-white/10">
            <div className="mx-auto max-w-5xl px-4 h-14 flex items-center justify-between gap-4">
              <Link href="/" className="text-base font-bold tracking-tight hover:text-orange-400 transition-colors">
                Zytherion
              </Link>
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
