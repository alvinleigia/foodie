"use client";

import Link from "next/link";
import { useState } from "react";
import { toast } from "sonner";

import { getCaughtErrorMessage, requestJson } from "@/lib/api-client";
import { FormField } from "@/components/shared/FormField";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

type InviteAcceptFormProps = {
  token: string;
};

export function InviteAcceptForm({ token }: InviteAcceptFormProps) {
  const [password, setPassword] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isAccepted, setIsAccepted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!token) {
    return (
      <Card className="rounded-xl border-stone-200 bg-white">
        <CardHeader className="px-6 pt-6">
          <h1 className="text-3xl font-semibold text-stone-950">Invalid invitation</h1>
        </CardHeader>
        <CardContent className="px-6 pb-6 text-sm text-stone-600">
          This invitation link is missing a token.
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
            Your password has been set. You can now sign in to Staff Operations.
          </p>
          <Button asChild className="rounded-lg bg-stone-950 text-white hover:bg-stone-800">
            <Link href="/staff/login">Go to login</Link>
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
        <h1 className="mt-2 text-3xl font-semibold text-stone-950">Set your password</h1>
      </CardHeader>
      <CardContent className="px-6 pb-6">
        <form
          className="grid gap-4"
          onSubmit={async (event) => {
            event.preventDefault();
            setIsSubmitting(true);

            try {
              await requestJson("/api/invitations/accept", {
                body: { token, password },
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
          <FormField label="Password">
            <Input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="Minimum 8 characters"
            />
          </FormField>
          <Button
            type="submit"
            disabled={isSubmitting}
            className="rounded-lg bg-stone-950 text-white hover:bg-stone-800"
          >
            {isSubmitting ? "Setting password..." : "Accept Invitation"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
