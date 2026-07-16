"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { SaveIcon, XIcon } from "lucide-react";
import { toast } from "sonner";

import { getApiError, requestJson } from "@/lib/api-client";
import { ButtonLabel } from "@/components/shared/ButtonLabel";
import { FormField } from "@/components/shared/FormField";
import { CurrencySelect, TimezoneSelect } from "@/components/shared/LocaleSelects";
import { useFormValidation } from "@/components/shared/useFormValidation";
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

type OrderingPointSettings = {
  name: string;
  label: string | null;
  qrSlug: string | null;
  isActive: boolean;
};

type StaffAccess = {
  membershipId: string;
  name: string;
  role: MembershipRole;
  isActive: boolean;
};

type TenantRestaurantField = "currency" | "logoUrl" | "name" | "timezone";
type TenantOrderingPointField = "isActive" | "label" | "name" | "qrSlug";
type TenantStaffAccessField = "isActive" | "role";

async function submitJson(path: string, method: "POST" | "PATCH", body: unknown) {
  return requestJson(path, {
    body,
    method,
  });
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
        <ButtonLabel icon={SaveIcon}>{isSaving ? "Saving..." : submitLabel}</ButtonLabel>
      </Button>
      <Button asChild type="button" variant="outline" className="rounded-lg">
        <Link href={backHref}>
          <ButtonLabel icon={XIcon}>Cancel</ButtonLabel>
        </Link>
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
  const validation = useFormValidation<TenantRestaurantField>();

  async function save() {
    setIsSaving(true);
    validation.clearErrors();
    try {
      await submitJson("/api/tenant/admin/organization", "PATCH", draft);
      toast.success("Restaurant settings updated.");
      router.push(backHref);
      router.refresh();
    } catch (err) {
      const result = validation.applyCaught(err);
      if (!result.hasFieldErrors) {
        toast.error(result.message);
      }
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
          {validation.formError ? (
            <p className="text-sm text-rose-600">{validation.formError}</p>
          ) : null}
          <FormField
            label="Name"
            error={validation.getError("name")}
            errorId="tenant-restaurant-name-error"
          >
            <Input
              value={draft.name}
              aria-describedby={
                validation.getError("name") ? "tenant-restaurant-name-error" : undefined
              }
              aria-invalid={Boolean(validation.getError("name"))}
              onChange={(event) => {
                validation.clearFieldError("name");
                setDraft((current) => ({ ...current, name: event.target.value }));
              }}
            />
          </FormField>
          <FormField
            label="Logo URL"
            error={validation.getError("logoUrl")}
            errorId="tenant-restaurant-logo-error"
          >
            <Input
              value={draft.logoUrl}
              aria-describedby={
                validation.getError("logoUrl") ? "tenant-restaurant-logo-error" : undefined
              }
              aria-invalid={Boolean(validation.getError("logoUrl"))}
              onChange={(event) => {
                validation.clearFieldError("logoUrl");
                setDraft((current) => ({ ...current, logoUrl: event.target.value }));
              }}
            />
          </FormField>
          <div className="grid gap-4 md:grid-cols-2">
            <FormField
              label="Timezone"
              error={validation.getError("timezone")}
              errorId="tenant-restaurant-timezone-error"
            >
              <TimezoneSelect
                value={draft.timezone}
                onValueChange={(timezone) => {
                  validation.clearFieldError("timezone");
                  setDraft((current) => ({ ...current, timezone }))
                }}
              />
            </FormField>
            <FormField
              label="Currency"
              error={validation.getError("currency")}
              errorId="tenant-restaurant-currency-error"
            >
              <CurrencySelect
                value={draft.currency}
                onValueChange={(currency) => {
                  validation.clearFieldError("currency");
                  setDraft((current) => ({ ...current, currency }))
                }}
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

export function TenantOrderingPointSettingsForm({
  backHref,
  orderingPoint,
}: {
  backHref: string;
  orderingPoint: OrderingPointSettings;
}) {
  const router = useRouter();
  const [draft, setDraft] = useState({
    name: orderingPoint.name,
    label: orderingPoint.label ?? "",
    qrSlug: orderingPoint.qrSlug ?? "",
    isActive: orderingPoint.isActive,
  });
  const [isSaving, setIsSaving] = useState(false);
  const validation = useFormValidation<TenantOrderingPointField>();
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
          `/api/tenant/admin/ordering-point/qr-slug?value=${encodeURIComponent(qrSlug)}`,
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
          error: payload.available
            ? null
            : "This QR slug is already used by another ordering point.",
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
      validation.setFieldError("qrSlug", "Please wait while QR slug availability is checked.");
      return;
    }

    if (qrSlugStatus.available === false) {
      validation.setFieldError("qrSlug", qrSlugStatus.error ?? "QR slug is not available.");
      return;
    }

    setIsSaving(true);
    validation.clearErrors();
    try {
      await submitJson("/api/tenant/admin/ordering-point", "PATCH", draft);
      toast.success("Ordering point settings updated.");
      router.push(backHref);
      router.refresh();
    } catch (err) {
      const result = validation.applyCaught(err);
      if (!result.hasFieldErrors) {
        toast.error(result.message);
      }
      setIsSaving(false);
    }
  }

  const qrSlugError = validation.getError("qrSlug") ?? qrSlugStatus.error;
  const qrSlugHelp =
    qrSlugStatus.isChecking
      ? "Checking QR slug availability..."
      : qrSlugError
        ? qrSlugError
        : draft.qrSlug.trim()
          ? "QR slug is available."
          : "Used in the public customer link, for example /order?qr=main-lobby.";

  return (
    <Card className="rounded-xl border-stone-200 bg-white">
      <CardHeader className="px-5 pt-5">
        <h3 className="text-2xl font-semibold text-stone-950">Edit ordering point</h3>
        <p className="text-sm text-stone-500">
          Update the default customer ordering point for this restaurant.
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
          {validation.formError ? (
            <p className="text-sm text-rose-600">{validation.formError}</p>
          ) : null}
          <FormField
            label="Name"
            error={validation.getError("name")}
            errorId="tenant-ordering-point-name-error"
          >
            <Input
              value={draft.name}
              aria-describedby={
                validation.getError("name")
                  ? "tenant-ordering-point-name-error"
                  : undefined
              }
              aria-invalid={Boolean(validation.getError("name"))}
              onChange={(event) => {
                validation.clearFieldError("name");
                setDraft((current) => ({ ...current, name: event.target.value }));
              }}
            />
          </FormField>
          <div className="grid gap-4 md:grid-cols-2">
            <FormField
              label="Label"
              error={validation.getError("label")}
              errorId="tenant-ordering-point-label-error"
            >
              <Input
                value={draft.label}
                aria-describedby={
                  validation.getError("label")
                    ? "tenant-ordering-point-label-error"
                    : undefined
                }
                aria-invalid={Boolean(validation.getError("label"))}
                onChange={(event) => {
                  validation.clearFieldError("label");
                  setDraft((current) => ({ ...current, label: event.target.value }));
                }}
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
                  validation.clearFieldError("qrSlug");
                  setQrSlugStatus(
                    nextQrSlug.trim()
                      ? { available: null, error: null, isChecking: true }
                      : { available: true, error: null, isChecking: false },
                  );
                }}
                aria-invalid={Boolean(qrSlugError)}
                className="aria-invalid:border-rose-500 aria-invalid:ring-2 aria-invalid:ring-rose-100"
              />
              <p
                className={
                  qrSlugError
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
            Ordering point is active
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
      assignExistingHref="/restaurant/staff/reassign"
      backHref={backHref}
      defaultRole="ORDER_OPERATOR"
      description="Create a one-time invite link for this restaurant."
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
  const validation = useFormValidation<TenantStaffAccessField>();

  async function save() {
    setIsSaving(true);
    validation.clearErrors();
    try {
      await submitJson(`/api/tenant/admin/staff/${staff.membershipId}`, "PATCH", draft);
      toast.success("Staff access updated.");
      router.push(backHref);
      router.refresh();
    } catch (err) {
      const result = validation.applyCaught(err);
      if (!result.hasFieldErrors) {
        toast.error(result.message);
      }
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
          {validation.formError ? (
            <p className="text-sm text-rose-600">{validation.formError}</p>
          ) : null}
          <FormField
            label="Role"
            error={validation.getError("role")}
            errorId="tenant-staff-role-error"
          >
            <StaffRoleSelect
              value={draft.role}
              onChange={(role) => {
                validation.clearFieldError("role");
                setDraft((current) => ({ ...current, role }));
              }}
            />
          </FormField>
          <div className="grid gap-2">
            <label className="flex items-center gap-2 text-sm text-stone-700">
              <input
                type="checkbox"
                checked={draft.isActive}
                onChange={(event) => {
                  validation.clearFieldError("isActive");
                  setDraft((current) => ({
                    ...current,
                    isActive: event.target.checked,
                  }));
                }}
                className="size-4 rounded border-stone-300"
              />
              Staff access is active
            </label>
            {validation.getError("isActive") ? (
              <p className="text-sm text-rose-600">{validation.getError("isActive")}</p>
            ) : null}
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
