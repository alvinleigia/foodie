"use client";

import Link from "next/link";
import { useState } from "react";
import { CopyIcon, UserCheckIcon, UserPlusIcon, XIcon } from "lucide-react";
import { toast } from "sonner";

import { requestJson } from "@/lib/api-client";
import { ButtonLabel } from "@/components/shared/ButtonLabel";
import { FormField } from "@/components/shared/FormField";
import { useFormValidation } from "@/components/shared/useFormValidation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type InviteRole = {
  label: string;
  value: string;
};

type StaffInviteFormProps = {
  apiPath: string;
  assignExistingHref?: string;
  backHref: string;
  backLabel?: string;
  defaultRole: string;
  description: string;
  onSuccess?: (payload: unknown) => Promise<void> | void;
  roles: InviteRole[];
  title: string;
};

const emptyInviteDraft = {
  username: "",
  name: "",
  email: "",
  role: "",
};

type StaffInviteField = "email" | "name" | "role" | "username";

export function StaffInviteForm({
  apiPath,
  assignExistingHref,
  backHref,
  backLabel = "Cancel",
  defaultRole,
  description,
  onSuccess,
  roles,
  title,
}: StaffInviteFormProps) {
  const [draft, setDraft] = useState({ ...emptyInviteDraft, role: defaultRole });
  const [inviteUrl, setInviteUrl] = useState<string | null>(null);
  const validation = useFormValidation<StaffInviteField>();
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function submitInvite() {
    validation.clearErrors();
    setIsSubmitting(true);

    let payload: { inviteUrl?: unknown };

    try {
      payload = await requestJson(apiPath, { body: draft });
    } catch (caught) {
      const result = validation.applyCaught(caught, "Failed to create invite.");
      if (!result.hasFieldErrors) {
        toast.error(result.message);
      }
      setIsSubmitting(false);
      return;
    }

    setDraft({ ...emptyInviteDraft, role: defaultRole });
    validation.clearErrors();
    setInviteUrl(typeof payload.inviteUrl === "string" ? payload.inviteUrl : null);
    await onSuccess?.(payload);
    setIsSubmitting(false);
    toast.success("Invite link created.");
  }

  const canAssignExisting =
    Boolean(assignExistingHref) &&
    validation.formError?.toLowerCase().includes("user already exists");
  const assignIdentifier = draft.email.trim() || draft.username.trim();
  const assignHref = assignExistingHref
    ? `${assignExistingHref}${assignExistingHref.includes("?") ? "&" : "?"}identifier=${encodeURIComponent(assignIdentifier)}`
    : "";

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
      <Card className="rounded-xl border-stone-200 bg-white">
        <CardHeader className="px-5 pt-5">
          <h3 className="text-2xl font-semibold text-stone-950">{title}</h3>
          <p className="text-sm text-stone-500">{description}</p>
        </CardHeader>
        <CardContent className="px-5 pb-5">
          <form
            className="grid gap-4"
            onSubmit={(event) => {
              event.preventDefault();
              void submitInvite();
            }}
          >
            {validation.formError ? (
              <div className="rounded-lg border border-rose-200 bg-rose-50 p-4">
                <p className="text-sm text-rose-700">{validation.formError}</p>
                {canAssignExisting ? (
                  <Button
                    asChild
                    type="button"
                    variant="outline"
                    className="mt-3 rounded-lg border-rose-200 bg-white text-stone-950 hover:bg-rose-100"
                  >
                    <Link href={assignHref}>
                      <ButtonLabel icon={UserCheckIcon}>Assign Existing User</ButtonLabel>
                    </Link>
                  </Button>
                ) : null}
              </div>
            ) : null}
            <div className="grid gap-4 md:grid-cols-3">
              <FormField
                label="Username"
                error={validation.getError("username")}
                errorId="invite-username-error"
              >
                <Input
                  value={draft.username}
                  aria-describedby={
                    validation.getError("username")
                      ? "invite-username-error"
                      : undefined
                  }
                  aria-invalid={Boolean(validation.getError("username"))}
                  onChange={(event) => {
                    validation.clearFieldError("username");
                    setDraft((current) => ({
                      ...current,
                      username: event.target.value,
                    }));
                  }}
                />
              </FormField>
              <FormField
                label="Name"
                error={validation.getError("name")}
                errorId="invite-name-error"
              >
                <Input
                  value={draft.name}
                  aria-describedby={
                    validation.getError("name") ? "invite-name-error" : undefined
                  }
                  aria-invalid={Boolean(validation.getError("name"))}
                  onChange={(event) => {
                    validation.clearFieldError("name");
                    setDraft((current) => ({ ...current, name: event.target.value }))
                  }}
                />
              </FormField>
              <FormField
                label="Email"
                error={validation.getError("email")}
                errorId="invite-email-error"
              >
                <Input
                  type="email"
                  value={draft.email}
                  aria-describedby={
                    validation.getError("email") ? "invite-email-error" : undefined
                  }
                  aria-invalid={Boolean(validation.getError("email"))}
                  onChange={(event) => {
                    validation.clearFieldError("email");
                    setDraft((current) => ({ ...current, email: event.target.value }))
                  }}
                />
              </FormField>
            </div>
            <FormField
              label="Role"
              error={validation.getError("role")}
              errorId="invite-role-error"
            >
              <Select
                value={draft.role}
                onValueChange={(role) => {
                  validation.clearFieldError("role");
                  setDraft((current) => ({ ...current, role }));
                }}
              >
                <SelectTrigger className="bg-white">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {roles.map((role) => (
                    <SelectItem key={role.value} value={role.value}>
                      {role.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </FormField>
            <div className="flex flex-wrap gap-3 pt-2">
              <Button
                type="submit"
                disabled={isSubmitting}
                className="rounded-lg bg-stone-950 text-white hover:bg-stone-800"
              >
                <ButtonLabel icon={UserPlusIcon}>
                  {isSubmitting ? "Creating..." : "Create invite"}
                </ButtonLabel>
              </Button>
              <Button asChild type="button" variant="outline" className="rounded-lg">
                <Link href={backHref}>
                  <ButtonLabel icon={XIcon}>{backLabel}</ButtonLabel>
                </Link>
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <Card className="rounded-xl border-stone-200 bg-white">
        <CardHeader className="px-5 pt-5">
          <h3 className="text-xl font-semibold text-stone-950">Invite link</h3>
        </CardHeader>
        <CardContent className="px-5 pb-5">
          {inviteUrl ? (
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-3">
              <p className="break-all text-sm text-stone-700">{inviteUrl}</p>
              <Button
                type="button"
                variant="outline"
                className="mt-3 rounded-lg border-amber-300 bg-white text-stone-900"
                onClick={() => {
                  void navigator.clipboard.writeText(inviteUrl);
                  toast.success("Invite link copied.");
                }}
              >
                <ButtonLabel icon={CopyIcon}>Copy Link</ButtonLabel>
              </Button>
            </div>
          ) : (
            <p className="text-sm leading-6 text-stone-600">
              Create an invite and the one-time acceptance link will appear here.
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
