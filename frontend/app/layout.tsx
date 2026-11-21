import type { Metadata, Viewport } from "next";
import { IBM_Plex_Mono, Inter, Spectral } from "next/font/google";
import { AppShell } from "@/components/app-shell";
import { THEME_SCRIPT } from "@/lib/theme-script";
import "./globals.css";

// Inter for controls and the product, Spectral (a restrained serif) for display headlines, IBM Plex Mono for evidence.
const inter = Inter({ variable: "--font-inter", subsets: ["latin"] });
const spectral = Spectral({ variable: "--font-spectral", subsets: ["latin"], weight: ["300", "400", "500"] });
const plexMono = IBM_Plex_Mono({ variable: "--font-plex-mono", subsets: ["latin"], weight: ["400", "500", "600"] });

export const metadata: Metadata = {
  title: "LEASH BLACKBOX",
  description: "Compare a server's logs with independently preserved evidence.",
};

// resizes-content: on Android the layout viewport shrinks with the keyboard, so Wick's sheet stays above it.
export const viewport: Viewport = { width: "device-width", initialScale: 1, interactiveWidget: "resizes-content" };

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" suppressHydrationWarning className={`${inter.variable} ${spectral.variable} ${plexMono.variable} h-full antialiased`}>
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
