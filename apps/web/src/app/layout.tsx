import type { Metadata } from "next";
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
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
