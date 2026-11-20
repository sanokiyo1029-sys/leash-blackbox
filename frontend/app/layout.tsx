import type { Metadata, Viewport } from "next";
import { Cormorant_Garamond, IBM_Plex_Mono, Inter } from "next/font/google";
import { AppShell } from "@/components/app-shell";
import { THEME_SCRIPT } from "@/lib/theme-script";
import "./globals.css";

// Inter for the product, Cormorant Garamond Semibold for editorial headlines, IBM Plex Mono for evidence.
const inter = Inter({ variable: "--font-inter", subsets: ["latin"] });
const cormorant = Cormorant_Garamond({ variable: "--font-cormorant", subsets: ["latin"], weight: ["600"] });
const plexMono = IBM_Plex_Mono({ variable: "--font-plex-mono", subsets: ["latin"], weight: ["400", "500", "600"] });

export const metadata: Metadata = {
  title: "LEASH BLACKBOX",
  description: "Compare a server's logs with independently preserved evidence.",
};

// resizes-content: on Android the layout viewport shrinks with the keyboard, so Wick's sheet stays above it.
export const viewport: Viewport = { width: "device-width", initialScale: 1, interactiveWidget: "resizes-content" };

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" suppressHydrationWarning className={`${inter.variable} ${cormorant.variable} ${plexMono.variable} h-full antialiased`}>
      <head>
        {/* Sets the theme class before the first paint, so a dark-mode visit never flashes light. */}
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      <body className="min-h-full">
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
