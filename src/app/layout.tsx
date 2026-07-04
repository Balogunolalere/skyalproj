import type { Metadata } from "next";
import { Fraunces, Instrument_Sans, JetBrains_Mono, Pacifico } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";

/* Display — Fraunces: an optical-size serif with crafted, editorial warmth.
   Pairs with the atelier / fashion world Skyal serves. Used with restraint. */
const fraunces = Fraunces({
  subsets: ["latin"],
  variable: "--font-fraunces",
  display: "swap",
  weight: ["400", "500", "600", "700"],
  style: ["normal", "italic"],
});

/* Body — Instrument Sans: a warm grotesk, less common than Inter/Geist. */
const instrumentSans = Instrument_Sans({
  subsets: ["latin"],
  variable: "--font-instrument-sans",
  display: "swap",
  weight: ["400", "500", "600", "700"],
});

/* Utility — JetBrains Mono: EARNED. Used only for coordinates, order
   numbers, timestamps — the G-code / bed-readout vernacular of laser cutting. */
const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-jetbrains-mono",
  display: "swap",
  weight: ["400", "500", "700"],
});

/* Wordmark — Pacifico: the original Skyal script logo. Kept exactly as the
   brand established it; the squiggle beneath is a laser-cut kerf mark. */
const pacifico = Pacifico({
  subsets: ["latin"],
  variable: "--font-pacifico",
  display: "swap",
  weight: ["400"],
});

export const metadata: Metadata = {
  title: "Skyal — Precision Laser Cutting, Cut on the Beam",
  description:
    "Send us your design. We laser-cut fabrics, leather, wood and acrylic — track every order from cutting bed to doorstep. Lagos, Nigeria.",
  keywords: [
    "laser cutting",
    "fabric cutting",
    "leather cutting",
    "Lagos",
    "Nigeria",
    "Skyal",
  ],
  authors: [{ name: "Skyal Laser Services" }],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${fraunces.variable} ${instrumentSans.variable} ${jetbrainsMono.variable} ${pacifico.variable} bg-bone text-ink antialiased`}
      >
        {children}
        <Toaster />
      </body>
    </html>
  );
}
