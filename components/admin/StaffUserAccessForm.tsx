"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { SaveIcon, XIcon } from "lucide-react";
import { toast } from "sonner";

import { requestJson } from "@/lib/api-client";
import { ButtonLabel } from "@/components/shared/ButtonLabel";
import { FormField } from "@/components/shared/FormField";
import { useFormValidation } from "@/components/shared/useFormValidation";
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

type StaffUserAccessField = "isActive" | "role";

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
  const validation = useFormValidation<StaffUserAccessField>();

  async function save() {
    validation.clearErrors();
    setIsSaving(true);

    try {
      await requestJson(apiPath, {
        body: draft,
        method: "PATCH",
      });
    } catch (caught) {
      const result = validation.applyCaught(caught, "Failed to update staff access.");
      setIsSaving(false);
      if (!result.hasFieldErrors) {
        toast.error(result.message);
      }
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
          {validation.formError ? (
            <p className="text-sm text-rose-600">{validation.formError}</p>
          ) : null}
          <FormField
            label="Role"
            error={validation.getError("role")}
            errorId="staff-user-role-error"
          >
            <Select
              value={draft.role}
              onValueChange={(role) => {
                validation.clearFieldError("role");
                setDraft((current) => ({
                  ...current,
                  role: role as StaffRole,
                }));
              }}
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
                aria-describedby={
                  validation.getError("isActive")
                    ? "staff-user-active-error"
                    : undefined
                }
                aria-invalid={Boolean(validation.getError("isActive"))}
                onChange={(event) => {
                  validation.clearFieldError("isActive");
                  setDraft((current) => ({
                    ...current,
                    isActive: event.target.checked,
                  }));
                }}
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
            {validation.getError("isActive") ? (
              <p id="staff-user-active-error" className="mt-2 text-sm text-rose-600">
                {validation.getError("isActive")}
              </p>
            ) : null}
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
              <ButtonLabel icon={SaveIcon}>
                {isSaving ? "Saving..." : "Save changes"}
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
