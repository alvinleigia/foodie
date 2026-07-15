"use client";

import { useEffect, useRef, useState } from "react";
import { signIn } from "next-auth/react";

import { Spinner } from "@/components/shared/Spinner";
import type { CustomerOAuthProvider } from "@/lib/customer-oauth-context";

type SocialLoginStartProps = {
  provider: CustomerOAuthProvider;
};

export function SocialLoginStart({ provider }: SocialLoginStartProps) {
  const started = useRef(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (started.current) {
      return;
    }

    started.current = true;
    void signIn(provider, {
      redirectTo: "/api/customer/auth/oauth-complete",
    }).catch(() => setFailed(true));
  }, [provider]);

  if (failed) {
    return (
      <p className="text-sm text-rose-600">
        Sign-in could not be started. Return to the restaurant and try again.
      </p>
    );
  }

  return (
    <div className="flex items-center gap-3 text-sm text-stone-600">
      <Spinner />
      Opening {provider.charAt(0).toUpperCase() + provider.slice(1)} sign-in...
    </div>
  );
}
