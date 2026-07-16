"use client";

import Link from "next/link";
import { useState } from "react";
import { ArrowLeftIcon, ClipboardIcon, KeyRoundIcon } from "lucide-react";
import { toast } from "sonner";

import { getCaughtErrorMessage, requestJson } from "@/lib/api-client";
import { ButtonLabel } from "@/components/shared/ButtonLabel";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import type { MembershipRole } from "@/lib/staff-auth";

type ResetTarget = {
  membershipId: string;
  username: string;
  name: string;
  email: string;
  userStatus: string;
  role: MembershipRole;
  isActive: boolean;
  organizationName: string;
};

type PasswordResetResponse = {
  resetUrl: string;
  expiresAt: string;
};

type PasswordResetLinkPanelProps = {
  apiPath: string;
  backHref: string;
  target: ResetTarget;
};

export function PasswordResetLinkPanel({
  apiPath,
  backHref,
  target,
}: PasswordResetLinkPanelProps) {
  const [resetUrl, setResetUrl] = useState("");
  const [expiresAt, setExpiresAt] = useState("");
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function createLink() {
    setIsCreating(true);

    try {
      const payload = await requestJson<PasswordResetResponse>(apiPath, {
        fallbackError: "Could not create password reset link.",
      });
      setResetUrl(payload.resetUrl);
      setExpiresAt(payload.expiresAt);
      setError(null);
      toast.success("Password reset link created.");
    } catch (caught) {
      const message = getCaughtErrorMessage(
        caught,
        "Could not create password reset link.",
      );
      setError(message);
      toast.error(message);
    }

    setIsCreating(false);
  }

  async function copyLink() {
    if (!resetUrl) {
      return;
    }

    await navigator.clipboard.writeText(resetUrl);
    toast.success("Reset link copied.");
  }

  return (
    <Card className="rounded-xl border-stone-200 bg-white">
      <CardHeader className="px-6 pt-6">
        <p className="text-sm font-semibold uppercase tracking-[0.3em] text-[rgb(199,76,0)]">
          User Security
        </p>
        <h2 className="mt-2 text-2xl font-semibold text-stone-950">
          Create password reset link
        </h2>
        <p className="mt-2 text-sm text-stone-500">
          Generate a one-time link for {target.name}. Existing access stays unchanged.
        </p>
      </CardHeader>
      <CardContent className="grid gap-5 px-6 pb-6">
        <div className="rounded-lg border border-stone-200 bg-stone-50 p-4">
          <p className="font-semibold text-stone-950">{target.name}</p>
          <p className="mt-1 text-sm text-stone-500">
            {target.username} - {target.email}
          </p>
          <p className="mt-1 text-xs uppercase tracking-[0.18em] text-stone-400">
            {target.role.replaceAll("_", " ")} - {target.organizationName}
          </p>
        </div>

        {error ? <p className="text-sm text-rose-600">{error}</p> : null}

        {resetUrl ? (
          <div className="grid gap-3 rounded-lg border border-stone-200 p-4">
            <p className="text-sm font-semibold text-stone-950">
              Share this reset link
            </p>
            <Input readOnly value={resetUrl} className="font-mono text-xs" />
            <p className="text-xs text-stone-500">
              This link expires on {new Date(expiresAt).toLocaleString()}.
            </p>
            <Button
              type="button"
              variant="outline"
              className="w-fit rounded-lg"
              onClick={() => void copyLink()}
            >
              <ButtonLabel icon={ClipboardIcon}>Copy Link</ButtonLabel>
            </Button>
          </div>
        ) : null}

        <div className="flex flex-wrap gap-3">
          <Button
            type="button"
            disabled={isCreating}
            className="rounded-lg bg-stone-950 text-white hover:bg-stone-800"
            onClick={() => void createLink()}
          >
            <ButtonLabel icon={KeyRoundIcon}>
              {isCreating ? "Creating..." : "Create Reset Link"}
            </ButtonLabel>
          </Button>
          <Button asChild variant="outline" className="rounded-lg">
            <Link href={backHref}>
              <ButtonLabel icon={ArrowLeftIcon}>Back</ButtonLabel>
            </Link>
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
