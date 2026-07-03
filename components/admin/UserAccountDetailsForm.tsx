"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { SaveIcon, XIcon } from "lucide-react";
import { toast } from "sonner";

import { ButtonLabel } from "@/components/shared/ButtonLabel";
import { FormField } from "@/components/shared/FormField";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { getCaughtErrorMessage, requestJson } from "@/lib/api-client";
import type { MembershipRole } from "@/lib/staff-auth";

type UserAccount = {
  membershipId: string;
  username: string;
  name: string;
  email: string;
  userStatus: string;
  role: MembershipRole;
  organizationName: string;
  locationName: string | null;
};

type UserAccountDetailsFormProps = {
  apiPath: string;
  backHref: string;
  user: UserAccount;
};

export function UserAccountDetailsForm({
  apiPath,
  backHref,
  user,
}: UserAccountDetailsFormProps) {
  const router = useRouter();
  const [draft, setDraft] = useState({
    username: user.username,
    name: user.name,
    email: user.email,
  });
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setIsSaving(true);

    try {
      await requestJson(apiPath, {
        body: draft,
        fallbackError: "Could not update account details.",
        method: "PATCH",
      });
    } catch (caught) {
      const message = getCaughtErrorMessage(
        caught,
        "Could not update account details.",
      );
      setError(message);
      setIsSaving(false);
      toast.error(message);
      return;
    }

    setError(null);
    toast.success("Account details updated.");
    router.push(backHref);
    router.refresh();
  }

  return (
    <Card className="rounded-xl border-stone-200 bg-white">
      <CardHeader className="px-5 pt-5">
        <h3 className="text-2xl font-semibold text-stone-950">
          Edit account details
        </h3>
        <p className="text-sm text-stone-500">
          Correct the person&apos;s name, username or email. Access is managed
          separately.
        </p>
      </CardHeader>
      <CardContent className="px-5 pb-5">
        <form
          className="grid gap-4"
          onSubmit={(event) => {
            event.preventDefault();
            void save();
          }}
        >
          <div className="rounded-lg border border-stone-200 bg-stone-50 p-4">
            <p className="font-semibold text-stone-950">{user.name}</p>
            <p className="mt-1 text-sm text-stone-500">
              {user.role.replaceAll("_", " ")} - {user.organizationName}
              {user.locationName ? ` - ${user.locationName}` : ""}
            </p>
            <p className="mt-1 text-xs uppercase tracking-[0.16em] text-stone-400">
              Account {user.userStatus.toLowerCase()}
            </p>
          </div>

          {error ? <p className="text-sm text-rose-600">{error}</p> : null}

          <FormField label="Name">
            <Input
              value={draft.name}
              onChange={(event) =>
                setDraft((current) => ({ ...current, name: event.target.value }))
              }
            />
          </FormField>

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

          <FormField label="Email">
            <Input
              type="email"
              value={draft.email}
              onChange={(event) =>
                setDraft((current) => ({ ...current, email: event.target.value }))
              }
            />
          </FormField>

          <div className="flex flex-wrap gap-3 pt-2">
            <Button
              type="submit"
              disabled={isSaving}
              className="rounded-lg bg-stone-950 text-white hover:bg-stone-800"
            >
              <ButtonLabel icon={SaveIcon}>
                {isSaving ? "Saving..." : "Save account"}
              </ButtonLabel>
            </Button>
            <Button asChild type="button" variant="outline" className="rounded-lg">
              <Link href={backHref}>
                <ButtonLabel icon={XIcon}>Cancel</ButtonLabel>
              </Link>
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
