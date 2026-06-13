"use client";

import { signOut } from "next-auth/react";

import { Button } from "@/components/ui/button";

export function SignOutButton() {
  return (
    <Button
      type="button"
      variant="outline"
      onClick={() => signOut({ callbackUrl: "/mixologist/login" })}
      className="rounded-lg border-stone-600/60 bg-white/5 px-4 text-stone-100 hover:bg-white/10 hover:text-white"
    >
      Sign Out
    </Button>
  );
}
