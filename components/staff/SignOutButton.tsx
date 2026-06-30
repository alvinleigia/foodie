"use client";

import { signOut } from "next-auth/react";
import { LogOutIcon } from "lucide-react";

import { ButtonLabel } from "@/components/shared/ButtonLabel";
import { Button } from "@/components/ui/button";

export function SignOutButton() {
  return (
    <Button
      type="button"
      variant="outline"
      onClick={() => signOut({ callbackUrl: "/staff/login" })}
      className="rounded-lg border-stone-600/60 bg-white/5 px-4 text-stone-100 hover:bg-white/10 hover:text-white"
    >
      <ButtonLabel icon={LogOutIcon}>Sign Out</ButtonLabel>
    </Button>
  );
}
