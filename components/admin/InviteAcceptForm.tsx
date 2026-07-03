"use client";

import Link from "next/link";
import { useState } from "react";
import { LogInIcon, UserCheckIcon } from "lucide-react";
import { toast } from "sonner";

import { getCaughtErrorMessage, requestJson } from "@/lib/api-client";
import { ButtonLabel } from "@/components/shared/ButtonLabel";
import { FormField } from "@/components/shared/FormField";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

type InviteAcceptFormProps = {
  invitation: {
    email: string;
    name: string;
    requiresPassword: boolean;
  } | null;
  token: string;
};

export function InviteAcceptForm({ invitation, token }: InviteAcceptFormProps) {
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isAccepted, setIsAccepted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!token || !invitation) {
    return (
      <Card className="rounded-xl border-stone-200 bg-white">
        <CardHeader className="px-6 pt-6">
          <h1 className="text-3xl font-semibold text-stone-950">Invalid invitation</h1>
        </CardHeader>
        <CardContent className="px-6 pb-6 text-sm text-stone-600">
          This invitation link is missing, invalid or expired.
        </CardContent>
      </Card>
    );
  }

  if (isAccepted) {
    return (
      <Card className="rounded-xl border-stone-200 bg-white">
        <CardHeader className="px-6 pt-6">
          <h1 className="text-3xl font-semibold text-stone-950">Account ready</h1>
        </CardHeader>
        <CardContent className="grid gap-4 px-6 pb-6">
          <p className="text-sm text-stone-600">
            Your access is ready. You can now sign in to Staff Operations.
          </p>
          <Button asChild className="rounded-lg bg-stone-950 text-white hover:bg-stone-800">
            <Link href="/staff/login">
              <ButtonLabel icon={LogInIcon}>Go to login</ButtonLabel>
            </Link>
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="rounded-xl border-stone-200 bg-white">
      <CardHeader className="px-6 pt-6">
        <p className="text-sm font-semibold uppercase tracking-[0.3em] text-amber-700">
          Staff Invitation
        </p>
        <h1 className="mt-2 text-3xl font-semibold text-stone-950">
          {invitation.requiresPassword ? "Set your password" : "Accept access"}
        </h1>
        <p className="mt-2 text-sm text-stone-500">
          {invitation.name} - {invitation.email}
        </p>
      </CardHeader>
      <CardContent className="px-6 pb-6">
        <form
          className="grid gap-4"
          onSubmit={async (event) => {
            event.preventDefault();

            if (invitation.requiresPassword && password !== confirmPassword) {
              setError("Passwords do not match.");
              return;
            }

            setIsSubmitting(true);

            try {
              await requestJson("/api/invitations/accept", {
                body: {
                  token,
                  ...(invitation.requiresPassword ? { password } : {}),
                },
                fallbackError: "Could not accept invitation.",
              });
            } catch (caught) {
              const message = getCaughtErrorMessage(caught, "Could not accept invitation.");
              setError(message);
              toast.error(message);
              setIsSubmitting(false);
              return;
            }

            setError(null);
            setIsAccepted(true);
            setIsSubmitting(false);
          }}
        >
          {error ? <p className="text-sm text-rose-600">{error}</p> : null}
          {invitation.requiresPassword ? (
            <>
              <FormField label="Password">
                <Input
                  type="password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  placeholder="Minimum 8 characters"
                />
              </FormField>
              <FormField label="Confirm password">
                <Input
                  type="password"
                  value={confirmPassword}
                  onChange={(event) => setConfirmPassword(event.target.value)}
                  placeholder="Re-enter password"
                />
              </FormField>
            </>
          ) : (
            <p className="rounded-lg border border-stone-200 bg-stone-50 p-4 text-sm text-stone-600">
              This email already has a Foodie account. Accepting this invite will
              add the new access to your existing login.
            </p>
          )}
          <Button
            type="submit"
            disabled={isSubmitting}
            className="rounded-lg bg-stone-950 text-white hover:bg-stone-800"
          >
            <ButtonLabel icon={UserCheckIcon}>
              {isSubmitting
                ? invitation.requiresPassword
                  ? "Setting password..."
                  : "Accepting..."
                : "Accept Invitation"}
            </ButtonLabel>
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
