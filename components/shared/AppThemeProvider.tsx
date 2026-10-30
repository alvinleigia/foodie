"use client";

import { ThemeProvider } from "next-themes";

export function AppThemeProvider({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider
      attribute="class"
      defaultTheme="dark"
      disableTransitionOnChange
      enableSystem
      storageKey="foodie-theme"
    >
      {children}
    </ThemeProvider>
  );
}
