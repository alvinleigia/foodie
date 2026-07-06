"use client";

import Link from "next/link";
import { useState } from "react";
import { LogInIcon, UserCheckIcon } from "lucide-react";
import { toast } from "sonner";

import { requestJson } from "@/lib/api-client";
import { ButtonLabel } from "@/components/shared/ButtonLabel";
import { FormField } from "@/components/shared/FormField";
import { useFormValidation } from "@/components/shared/useFormValidation";
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

type InviteAcceptField = "confirmPassword" | "password" | "token";

export function InviteAcceptForm({ invitation, token }: InviteAcceptFormProps) {
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isAccepted, setIsAccepted] = useState(false);
  const validation = useFormValidation<InviteAcceptField>();

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
            validation.clearErrors();

            if (invitation.requiresPassword && password !== confirmPassword) {
              validation.setFieldError("confirmPassword", "Passwords do not match.");
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
              const result = validation.applyCaught(caught, "Could not accept invitation.");
              if (!result.hasFieldErrors) {
                toast.error(result.message);
              }
              setIsSubmitting(false);
              return;
            }

            validation.clearErrors();
            setIsAccepted(true);
            setIsSubmitting(false);
          }}
        >
          {validation.formError ? (
            <p className="text-sm text-rose-600">{validation.formError}</p>
          ) : null}
          {invitation.requiresPassword ? (
            <>
              <FormField
                label="Password"
                error={validation.getError("password")}
                errorId="invite-password-error"
              >
                <Input
                  type="password"
                  value={password}
                  aria-describedby={
                    validation.getError("password") ? "invite-password-error" : undefined
                  }
                  aria-invalid={Boolean(validation.getError("password"))}
                  onChange={(event) => {
                    validation.clearFieldError("password");
                    setPassword(event.target.value);
                  }}
                  placeholder="Minimum 8 characters"
                />
              </FormField>
              <FormField
                label="Confirm password"
                error={validation.getError("confirmPassword")}
                errorId="invite-confirm-password-error"
              >
                <Input
                  type="password"
                  value={confirmPassword}
                  aria-describedby={
                    validation.getError("confirmPassword")
                      ? "invite-confirm-password-error"
                      : undefined
                  }
                  aria-invalid={Boolean(validation.getError("confirmPassword"))}
                  onChange={(event) => {
                    validation.clearFieldError("confirmPassword");
                    setConfirmPassword(event.target.value);
                  }}
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
