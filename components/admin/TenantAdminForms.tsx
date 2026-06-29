"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { FormField } from "@/components/shared/FormField";
import { CurrencySelect, TimezoneSelect } from "@/components/shared/LocaleSelects";
import { StaffInviteForm } from "@/components/admin/StaffInviteForm";
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
import type { MembershipRole } from "@/lib/staff-auth";

type StaffRole = Extract<MembershipRole, "RESTAURANT_MANAGER" | "ORDER_OPERATOR">;

const staffRoles: StaffRole[] = ["RESTAURANT_MANAGER", "ORDER_OPERATOR"];

type RestaurantSettings = {
  name: string;
  logoUrl: string | null;
  timezone: string;
  currency: string;
};

type LocationSettings = {
  name: string;
  label: string | null;
  qrSlug: string | null;
  timezone: string;
  isActive: boolean;
};

type StaffAccess = {
  membershipId: string;
  name: string;
  role: MembershipRole;
  isActive: boolean;
};

function getApiError(payload: unknown) {
  if (payload && typeof payload === "object" && "error" in payload) {
    const error = (payload as { error?: unknown }).error;

    if (typeof error === "string") {
      return error;
    }
  }

  return "Action failed.";
}

async function submitJson(path: string, method: "POST" | "PATCH", body: unknown) {
  const response = await fetch(path, {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const payload = await response.json();

  if (!response.ok) {
    throw new Error(getApiError(payload));
  }

  return payload;
}

function StaffRoleSelect({
  onChange,
  value,
}: {
  onChange: (role: StaffRole) => void;
  value: StaffRole;
}) {
  return (
    <Select value={value} onValueChange={(role) => onChange(role as StaffRole)}>
      <SelectTrigger className="bg-white">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {staffRoles.map((role) => (
          <SelectItem key={role} value={role}>
            {role.replaceAll("_", " ")}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function FormActions({
  backHref = "/restaurant",
  isDisabled = false,
  isSaving,
  submitLabel,
}: {
  backHref?: string;
  isDisabled?: boolean;
  isSaving: boolean;
  submitLabel: string;
}) {
  return (
    <div className="flex flex-wrap gap-3 pt-2">
      <Button
        type="submit"
        disabled={isSaving || isDisabled}
        className="rounded-lg bg-stone-950 text-white hover:bg-stone-800"
      >
        {isSaving ? "Saving..." : submitLabel}
      </Button>
      <Button asChild type="button" variant="outline" className="rounded-lg">
        <Link href={backHref}>Cancel</Link>
      </Button>
    </div>
  );
}

export function TenantRestaurantSettingsForm({
  backHref,
  organization,
}: {
  backHref: string;
  organization: RestaurantSettings;
}) {
  const router = useRouter();
  const [draft, setDraft] = useState({
    name: organization.name,
    logoUrl: organization.logoUrl ?? "",
    timezone: organization.timezone,
    currency: organization.currency,
  });
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setIsSaving(true);
    try {
      await submitJson("/api/tenant/admin/organization", "PATCH", draft);
      toast.success("Restaurant settings updated.");
      router.push(backHref);
      router.refresh();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Action failed.";
      setError(message);
      toast.error(message);
      setIsSaving(false);
    }
  }

  return (
    <Card className="rounded-xl border-stone-200 bg-white">
      <CardHeader className="px-5 pt-5">
        <h3 className="text-2xl font-semibold text-stone-950">Edit restaurant</h3>
        <p className="text-sm text-stone-500">
          Update the current restaurant tenant details.
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
          {error ? <p className="text-sm text-rose-600">{error}</p> : null}
          <FormField label="Name">
            <Input
              value={draft.name}
              onChange={(event) =>
                setDraft((current) => ({ ...current, name: event.target.value }))
              }
            />
          </FormField>
          <FormField label="Logo URL">
            <Input
              value={draft.logoUrl}
              onChange={(event) =>
                setDraft((current) => ({ ...current, logoUrl: event.target.value }))
              }
            />
          </FormField>
          <div className="grid gap-4 md:grid-cols-2">
            <FormField label="Timezone">
              <TimezoneSelect
                value={draft.timezone}
                onValueChange={(timezone) =>
                  setDraft((current) => ({ ...current, timezone }))
                }
              />
            </FormField>
            <FormField label="Currency">
              <CurrencySelect
                value={draft.currency}
                onValueChange={(currency) =>
                  setDraft((current) => ({ ...current, currency }))
                }
              />
            </FormField>
          </div>
          <FormActions
            backHref={backHref}
            isSaving={isSaving}
            submitLabel="Save changes"
          />
        </form>
      </CardContent>
    </Card>
  );
}

export function TenantLocationSettingsForm({
  backHref,
  location,
}: {
  backHref: string;
  location: LocationSettings;
}) {
  const router = useRouter();
  const [draft, setDraft] = useState({
    name: location.name,
    label: location.label ?? "",
    qrSlug: location.qrSlug ?? "",
    timezone: location.timezone,
    isActive: location.isActive,
  });
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [qrSlugStatus, setQrSlugStatus] = useState<{
    available: boolean | null;
    error: string | null;
    isChecking: boolean;
  }>({
    available: null,
    error: null,
    isChecking: false,
  });

  useEffect(() => {
    const qrSlug = draft.qrSlug.trim();

    if (!qrSlug) {
      return;
    }

    const controller = new AbortController();
    const timeout = window.setTimeout(async () => {
      try {
        const response = await fetch(
          `/api/tenant/admin/location/qr-slug?value=${encodeURIComponent(qrSlug)}`,
          { signal: controller.signal },
        );
        const payload = await response.json();

        if (!response.ok) {
          const message = getApiError(payload);
          setQrSlugStatus({ available: false, error: message, isChecking: false });
          return;
        }

        setQrSlugStatus({
          available: Boolean(payload.available),
          error: payload.available ? null : "This QR slug is already used by another location.",
          isChecking: false,
        });
      } catch (err) {
        if ((err as DOMException).name === "AbortError") {
          return;
        }

        setQrSlugStatus({
          available: false,
          error: "Could not check QR slug availability.",
          isChecking: false,
        });
      }
    }, 350);

    return () => {
      controller.abort();
      window.clearTimeout(timeout);
    };
  }, [draft.qrSlug]);

  async function save() {
    if (qrSlugStatus.isChecking) {
      setError("Please wait while QR slug availability is checked.");
      return;
    }

    if (qrSlugStatus.available === false) {
      setError(qrSlugStatus.error ?? "QR slug is not available.");
      return;
    }

    setIsSaving(true);
    try {
      await submitJson("/api/tenant/admin/location", "PATCH", draft);
      toast.success("Location settings updated.");
      router.push(backHref);
      router.refresh();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Action failed.";
      setError(message);
      toast.error(message);
      setIsSaving(false);
    }
  }

  const qrSlugHelp =
    qrSlugStatus.isChecking
      ? "Checking QR slug availability..."
      : qrSlugStatus.error
        ? qrSlugStatus.error
        : draft.qrSlug.trim()
          ? "QR slug is available."
          : "Used in the public customer link, for example /order?qr=main-lobby.";

  return (
    <Card className="rounded-xl border-stone-200 bg-white">
      <CardHeader className="px-5 pt-5">
        <h3 className="text-2xl font-semibold text-stone-950">Edit location</h3>
        <p className="text-sm text-stone-500">
          Update the live operating location for this restaurant.
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
          {error ? <p className="text-sm text-rose-600">{error}</p> : null}
          <FormField label="Name">
            <Input
              value={draft.name}
              onChange={(event) =>
                setDraft((current) => ({ ...current, name: event.target.value }))
              }
            />
          </FormField>
          <div className="grid gap-4 md:grid-cols-2">
            <FormField label="Label">
              <Input
                value={draft.label}
                onChange={(event) =>
                  setDraft((current) => ({ ...current, label: event.target.value }))
                }
              />
            </FormField>
            <FormField label="QR slug">
              <Input
                value={draft.qrSlug}
                onChange={(event) => {
                  const nextQrSlug = event.target.value.toLowerCase();

                  setDraft((current) => ({
                    ...current,
                    qrSlug: nextQrSlug,
                  }));
                  setQrSlugStatus(
                    nextQrSlug.trim()
                      ? { available: null, error: null, isChecking: true }
                      : { available: true, error: null, isChecking: false },
                  );
                }}
                aria-invalid={Boolean(qrSlugStatus.error)}
                className="aria-invalid:border-rose-500 aria-invalid:ring-2 aria-invalid:ring-rose-100"
              />
              <p
                className={
                  qrSlugStatus.error
                    ? "text-sm text-rose-600"
                    : draft.qrSlug.trim() && qrSlugStatus.available
                      ? "text-sm text-emerald-700"
                      : "text-sm text-stone-500"
                }
              >
                {qrSlugHelp}
              </p>
            </FormField>
          </div>
          <FormField label="Timezone">
            <TimezoneSelect
              value={draft.timezone}
              onValueChange={(timezone) =>
                setDraft((current) => ({ ...current, timezone }))
              }
            />
          </FormField>
          <label className="flex items-center gap-2 text-sm text-stone-700">
            <input
              type="checkbox"
              checked={draft.isActive}
              onChange={(event) =>
                setDraft((current) => ({
                  ...current,
                  isActive: event.target.checked,
                }))
              }
              className="size-4 rounded border-stone-300"
            />
            Location is active
          </label>
          <FormActions
            backHref={backHref}
            isDisabled={qrSlugStatus.isChecking || qrSlugStatus.available === false}
            isSaving={isSaving}
            submitLabel={qrSlugStatus.isChecking ? "Checking..." : "Save changes"}
          />
        </form>
      </CardContent>
    </Card>
  );
}

export function TenantStaffInviteForm({ backHref }: { backHref: string }) {
  return (
    <StaffInviteForm
      apiPath="/api/tenant/admin/staff/invite"
      backHref={backHref}
      defaultRole="ORDER_OPERATOR"
      description="Create a one-time invite link for this restaurant location."
      roles={[
        { label: "Restaurant Manager", value: "RESTAURANT_MANAGER" },
        { label: "Order Operator", value: "ORDER_OPERATOR" },
      ]}
      title="Invite staff"
    />
  );
}

export function TenantStaffAccessForm({
  backHref,
  staff,
}: {
  backHref: string;
  staff: StaffAccess;
}) {
  const router = useRouter();
  const initialRole =
    staff.role === "ORDER_OPERATOR" ? "ORDER_OPERATOR" : "RESTAURANT_MANAGER";
  const [draft, setDraft] = useState<{ role: StaffRole; isActive: boolean }>({
    role: initialRole,
    isActive: staff.isActive,
  });
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setIsSaving(true);
    try {
      await submitJson(`/api/tenant/admin/staff/${staff.membershipId}`, "PATCH", draft);
      toast.success("Staff access updated.");
      router.push(backHref);
      router.refresh();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Action failed.";
      setError(message);
      toast.error(message);
      setIsSaving(false);
    }
  }

  return (
    <Card className="rounded-xl border-stone-200 bg-white">
      <CardHeader className="px-5 pt-5">
        <h3 className="text-2xl font-semibold text-stone-950">Edit staff access</h3>
        <p className="text-sm text-stone-500">{staff.name}</p>
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
            <StaffRoleSelect
              value={draft.role}
              onChange={(role) => setDraft((current) => ({ ...current, role }))}
            />
          </FormField>
          <label className="flex items-center gap-2 text-sm text-stone-700">
            <input
              type="checkbox"
              checked={draft.isActive}
              onChange={(event) =>
                setDraft((current) => ({
                  ...current,
                  isActive: event.target.checked,
                }))
              }
              className="size-4 rounded border-stone-300"
            />
            Staff access is active
          </label>
          <FormActions
            backHref={backHref}
            isSaving={isSaving}
            submitLabel="Save changes"
          />
        </form>
      </CardContent>
    </Card>
  );
}
