import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { Suspense } from "react";
import "./globals.css";
import { cn } from "@/lib/utils";
import { AppThemeProvider } from "@/components/shared/AppThemeProvider";
import { Toaster } from "@/components/ui/sonner";
import { RouteTransitionOverlay } from "@/components/shared/RouteTransitionOverlay";

const geistSans = Geist({
  subsets: ["latin"],
  variable: "--font-geist-sans",
});

const geistMono = Geist_Mono({
  subsets: ["latin"],
  variable: "--font-geist-mono",
});

export const metadata: Metadata = {
  title: "AGO Foodie",
  description: "Restaurant ordering workflow for customers and staff operations.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={cn(geistSans.variable, geistMono.variable, "h-full font-sans antialiased")}
    >
      <body className="min-h-full flex flex-col">
        <AppThemeProvider>
          {children}
          <Suspense fallback={null}>
            <RouteTransitionOverlay />
          </Suspense>
          <Toaster position="top-right" richColors />
        </AppThemeProvider>
      </body>
    </html>
  );
}
