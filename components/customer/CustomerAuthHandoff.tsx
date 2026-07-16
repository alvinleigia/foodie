"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { signIn } from "next-auth/react";

import { Spinner } from "@/components/shared/Spinner";

type CustomerAuthHandoffProps = {
  returnTo: string;
  token: string;
};

export function CustomerAuthHandoff({ returnTo, token }: CustomerAuthHandoffProps) {
  const router = useRouter();
  const started = useRef(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (started.current) {
      return;
    }

    started.current = true;
    void signIn("customer-auth-handoff", {
      redirect: false,
      token,
    })
      .then((result) => {
        if (!result.ok) {
          setFailed(true);
          return;
        }

        router.replace(returnTo);
        router.refresh();
      })
      .catch(() => setFailed(true));
  }, [returnTo, router, token]);

  if (failed) {
    return (
      <p className="text-sm text-rose-600">
        This sign-in link is invalid or has expired. Please try signing in again.
      </p>
    );
  }

  return (
    <div className="flex items-center gap-3 text-sm text-stone-600">
      <Spinner />
      Returning to the restaurant...
    </div>
  );
}
