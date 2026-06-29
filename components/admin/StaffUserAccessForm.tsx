"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

import { FormField } from "@/components/shared/FormField";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { MembershipRole } from "@/lib/staff-auth";

type StaffRole = Extract<MembershipRole, "RESTAURANT_MANAGER" | "ORDER_OPERATOR">;

type StaffUserAccess = {
  accessLabel?: string;
  email: string;
  isActive: boolean;
  membershipId: string;
  name: string;
  role: MembershipRole;
  userStatus: string;
  username: string;
};

type StaffUserAccessFormProps = {
  apiPath: string;
  backHref: string;
  user: StaffUserAccess;
};

const staffRoles: Array<{ label: string; value: StaffRole }> = [
  { label: "Restaurant Manager", value: "RESTAURANT_MANAGER" },
  { label: "Order Operator", value: "ORDER_OPERATOR" },
];

function getApiError(payload: unknown) {
  if (payload && typeof payload === "object" && "error" in payload) {
    const error = (payload as { error?: unknown }).error;

    if (typeof error === "string") {
      return error;
    }
  }

  return "Action failed.";
}

export function StaffUserAccessForm({
  apiPath,
  backHref,
  user,
}: StaffUserAccessFormProps) {
  const router = useRouter();
  const initialRole =
    user.role === "RESTAURANT_MANAGER" ? "RESTAURANT_MANAGER" : "ORDER_OPERATOR";
  const [draft, setDraft] = useState<{ role: StaffRole; isActive: boolean }>({
    role: initialRole,
    isActive: user.isActive,
  });
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setIsSaving(true);
    const response = await fetch(apiPath, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(draft),
    });
    const payload = await response.json();

    if (!response.ok) {
      const message = getApiError(payload);
      setError(message);
      setIsSaving(false);
      toast.error(message);
      return;
    }

    toast.success(draft.isActive ? "Staff access updated." : "Staff access disabled.");
    router.push(backHref);
    router.refresh();
  }

  return (
    <Card className="rounded-xl border-stone-200 bg-white">
      <CardHeader className="px-5 pt-5">
        <h3 className="text-2xl font-semibold text-stone-950">Edit staff access</h3>
        <p className="text-sm text-stone-500">
          {user.name} - {user.username} - {user.email}
        </p>
        {user.accessLabel ? (
          <p className="text-xs uppercase tracking-[0.16em] text-stone-400">
            {user.accessLabel}
          </p>
        ) : null}
      </CardHeader>
      <CardContent className="px-5 pb-5">
        <form
          className="grid gap-4"
          onSubmit={(event) => {
            event.preventDefault();
            void save();
          }}
        >
          {error ? <p className="text-sm text-rose-600">{error}</p> : null}
          <FormField label="Role">
            <Select
              value={draft.role}
              onValueChange={(role) =>
                setDraft((current) => ({
                  ...current,
                  role: role as StaffRole,
                }))
              }
            >
              <SelectTrigger className="bg-white">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {staffRoles.map((role) => (
                  <SelectItem key={role.value} value={role.value}>
                    {role.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FormField>

          <div className="rounded-lg border border-stone-200 bg-stone-50 p-4">
            <label className="flex items-start gap-3 text-sm text-stone-700">
              <input
                type="checkbox"
                checked={draft.isActive}
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    isActive: event.target.checked,
                  }))
                }
                className="mt-1 size-4 rounded border-stone-300"
              />
              <span>
                <span className="block font-medium text-stone-950">
                  Staff access is active
                </span>
                <span className="mt-1 block text-stone-500">
                  Turn this off to remove this user from active location access.
                  Any pending invite link for this membership will be expired.
                </span>
              </span>
            </label>
          </div>

          <p className="text-xs uppercase tracking-[0.16em] text-stone-400">
            Current account status: {user.userStatus}
          </p>

          <div className="flex flex-wrap gap-3 pt-2">
            <Button
              type="submit"
              disabled={isSaving}
              className="rounded-lg bg-stone-950 text-white hover:bg-stone-800"
            >
              {isSaving ? "Saving..." : "Save changes"}
            </Button>
            <Button asChild type="button" variant="outline" className="rounded-lg">
              <Link href={backHref}>Cancel</Link>
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
