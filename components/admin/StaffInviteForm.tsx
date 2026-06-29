"use client";

import Link from "next/link";
import { useState } from "react";
import { toast } from "sonner";

import { getCaughtErrorMessage, requestJson } from "@/lib/api-client";
import { FormField } from "@/components/shared/FormField";
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

export function StaffInviteForm({
  apiPath,
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
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function submitInvite() {
    setIsSubmitting(true);

    let payload: { inviteUrl?: unknown };

    try {
      payload = await requestJson(apiPath, { body: draft });
    } catch (caught) {
      const message = getCaughtErrorMessage(caught);
      setError(message);
      toast.error(message);
      setIsSubmitting(false);
      return;
    }

    setDraft({ ...emptyInviteDraft, role: defaultRole });
    setError(null);
    setInviteUrl(typeof payload.inviteUrl === "string" ? payload.inviteUrl : null);
    await onSuccess?.(payload);
    setIsSubmitting(false);
    toast.success("Invite link created.");
  }

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
            {error ? <p className="text-sm text-rose-600">{error}</p> : null}
            <div className="grid gap-4 md:grid-cols-3">
              <FormField label="Username">
                <Input
                  value={draft.username}
                  onChange={(event) =>
                    setDraft((current) => ({
                      ...current,
                      username: event.target.value,
                    }))
                  }
                />
              </FormField>
              <FormField label="Name">
                <Input
                  value={draft.name}
                  onChange={(event) =>
                    setDraft((current) => ({ ...current, name: event.target.value }))
                  }
                />
              </FormField>
              <FormField label="Email">
                <Input
                  type="email"
                  value={draft.email}
                  onChange={(event) =>
                    setDraft((current) => ({ ...current, email: event.target.value }))
                  }
                />
              </FormField>
            </div>
            <FormField label="Role">
              <Select
                value={draft.role}
                onValueChange={(role) =>
                  setDraft((current) => ({ ...current, role }))
                }
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
                {isSubmitting ? "Creating..." : "Create invite"}
              </Button>
              <Button asChild type="button" variant="outline" className="rounded-lg">
                <Link href={backHref}>{backLabel}</Link>
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
                Copy Link
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
