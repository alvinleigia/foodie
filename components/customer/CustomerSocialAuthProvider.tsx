"use client";

import { SessionProvider } from "next-auth/react";

export function CustomerSocialAuthProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <SessionProvider basePath="/api/customer-social-auth" session={null}>
      {children}
    </SessionProvider>
  );
}
