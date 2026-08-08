import type { Metadata } from "next";
import { DM_Sans, JetBrains_Mono } from "next/font/google";
import { Toaster } from "sonner";
import "./globals.css";

const dmSans = DM_Sans({
  variable: "--font-dm-sans",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
});

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-jetbrains-mono",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

export const metadata: Metadata = {
  title: "WOD Assistant",
  description:
    "Constraint-aware workout programming and tracking — CrossFit, strength, running, and bodybuilding.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className={`${dmSans.variable} ${jetbrainsMono.variable} antialiased`}>
        {children}
        <Toaster
          richColors
          position="top-right"
          toastOptions={{
            style: {
              background: "var(--color-card)",
              border: "1px solid var(--color-border-hi)",
              color: "var(--color-ink)",
            },
          }}
        />
      </body>
    </html>
  );
}
