import type { Metadata, Viewport } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import { Providers } from "./providers";
import "./globals.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  weight: ["400", "500"],
});

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-jetbrains-mono",
  subsets: ["latin"],
  weight: ["400", "500"],
});

const APP_URL = "https://app.kraterion.com";
// Short title for the browser tab; richer title for link unfurls. Both
// track the landing's agent-runtime positioning (apps/landing layout).
const TITLE = "Kraterion";
const OG_TITLE = "Kraterion · A runtime for agents you can audit";
const DESCRIPTION =
  "Run any agent and record every run as a tamper-evident, replayable trail. Debug, reproduce, and audit your agents — built on object storage you own.";

export const metadata: Metadata = {
  metadataBase: new URL(APP_URL),
  title: {
    default: TITLE,
    template: "%s · Kraterion",
  },
  description: DESCRIPTION,
  applicationName: "Kraterion",
  // The console is behind auth — keep it out of search indexes. The
  // OG/Twitter cards below are only for link unfurls (Slack, iMessage).
  robots: { index: false, follow: false },
  openGraph: {
    type: "website",
    locale: "en_US",
    url: APP_URL,
    siteName: "Kraterion",
    title: OG_TITLE,
    description: DESCRIPTION,
  },
  twitter: {
    card: "summary_large_image",
    title: OG_TITLE,
    description: DESCRIPTION,
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  colorScheme: "light",
  themeColor: "#F8F4EC",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${inter.variable} ${jetbrainsMono.variable}`}>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
