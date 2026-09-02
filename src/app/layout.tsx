import type { Metadata, Viewport } from "next";
import { Bricolage_Grotesque, Instrument_Sans, Newsreader, Roboto_Mono } from "next/font/google";
import "./globals.css";

const instrumentSans = Instrument_Sans({
  subsets: ["latin"],
  variable: "--font-instrument-sans",
  display: "swap",
});

// Editorial serif for the school's own public page — deliberately not the
// display face used inside the admin app.
const newsreader = Newsreader({
  subsets: ["latin"],
  variable: "--font-newsreader",
  display: "swap",
  weight: ["400", "500", "600"],
  style: ["normal", "italic"],
});

// 800 is here for the landing page's display type only — the app itself never
// goes above 600, where Bricolage stops being readable at 18px.
const bricolage = Bricolage_Grotesque({
  subsets: ["latin"],
  variable: "--font-bricolage",
  display: "swap",
  weight: ["500", "600", "700", "800"],
});

// Micro-labels on the landing page. Mono signals "tool", which is the promise.
const robotoMono = Roboto_Mono({
  subsets: ["latin"],
  variable: "--font-roboto-mono",
  display: "swap",
  weight: ["400", "500"],
});

export const metadata: Metadata = {
  title: "Flanca — the school system you can switch on this afternoon",
  description:
    "Complete school management for Indian schools: admissions, fees, attendance, exams, report cards, compliance. One tap per task. Works offline.",
  manifest: "/manifest.webmanifest",
  icons: { icon: "/icon.svg", apple: "/icon.svg" },
  appleWebApp: { capable: true, title: "Flanca", statusBarStyle: "default" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#0f3a2c",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body
        className={`${instrumentSans.variable} ${bricolage.variable} ${newsreader.variable} ${robotoMono.variable}`}
      >
        {children}
      </body>
    </html>
  );
}
