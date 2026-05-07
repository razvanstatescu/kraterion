import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Kraterion",
  description: "Storage you own.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
