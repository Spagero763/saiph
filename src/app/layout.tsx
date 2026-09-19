import type { Metadata } from "next";
import { Fraunces, Space_Grotesk, JetBrains_Mono } from "next/font/google";
import "./globals.css";

const display = Fraunces({
  variable: "--font-display",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  style: ["normal", "italic"],
});

const body = Space_Grotesk({
  variable: "--font-body",
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700"],
});

const mono = JetBrains_Mono({
  variable: "--font-mono",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
});

export const metadata: Metadata = {
  metadataBase: new URL("https://saiph.xyz"),
  title: "Saiph · the wallet security agent that proves what it finds",
  description:
    "Saiph reads a Base wallet's live token approvals, simulates the drain on-chain, and shows exactly how much is reachable right now. The model decides where to look. The chain proves the number.",
  openGraph: {
    title: "Saiph · prove what's reachable",
    description:
      "A security agent for Base that simulates the drain and returns signable revoke routes. Every figure traced to an on-chain call.",
    type: "website",
  },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${display.variable} ${body.variable} ${mono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
