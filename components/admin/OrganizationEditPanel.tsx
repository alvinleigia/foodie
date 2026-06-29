"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

import { FormField } from "@/components/shared/FormField";
import { CurrencySelect, TimezoneSelect } from "@/components/shared/LocaleSelects";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

type EditableOrganization = {
  id: string;
  name: string;
  slug: string;
  timezone: string;
  currency: string;
  isActive: boolean;
  primaryLocation?: {
    id: string;
    name: string;
    label: string | null;
    qrSlug: string | null;
    timezone: string;
    isActive: boolean;
  } | null;
};

type OrganizationEditPanelProps = {
  apiPath: string;
  backHref: string;
  entityLabel: string;
  organization: EditableOrganization;
  showPrimaryLocation?: boolean;
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

export function OrganizationEditPanel({
  apiPath,
  backHref,
  entityLabel,
  organization,
  showPrimaryLocation = false,
}: OrganizationEditPanelProps) {
  const router = useRouter();
  const [draft, setDraft] = useState({
    name: organization.name,
    timezone: organization.timezone,
    currency: organization.currency,
    isActive: organization.isActive,
    location: organization.primaryLocation
      ? {
          name: organization.primaryLocation.name,
          label: organization.primaryLocation.label ?? "",
          qrSlug: organization.primaryLocation.qrSlug ?? "",
          timezone: organization.primaryLocation.timezone,
          isActive: organization.primaryLocation.isActive,
        }
      : undefined,
  });
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submitUpdate(nextDraft = draft) {
    setIsSaving(true);
    const response = await fetch(apiPath, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(nextDraft),
    });
    const payload = await response.json();

    if (!response.ok) {
      const message = getApiError(payload);
      setError(message);
      toast.error(message);
      setIsSaving(false);
      return;
    }

    setError(null);
    setDraft(nextDraft);
    setIsSaving(false);
    toast.success(`${entityLabel} updated.`);
    router.refresh();
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
      <Card className="rounded-xl border-stone-200 bg-white">
        <CardHeader className="px-5 pt-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-stone-500">
                {organization.slug}
              </p>
              <h3 className="mt-2 text-2xl font-semibold text-stone-950">
                Edit {entityLabel.toLowerCase()}
              </h3>
            </div>
            <span className="rounded-md border border-stone-200 bg-stone-50 px-2.5 py-1 text-xs font-semibold uppercase tracking-[0.14em] text-stone-600">
              {draft.isActive ? "Active" : "Disabled"}
            </span>
          </div>
        </CardHeader>
        <CardContent className="px-5 pb-5">
          <form
            className="grid gap-4"
            onSubmit={(event) => {
              event.preventDefault();
              void submitUpdate();
            }}
          >
            {error ? <p className="text-sm text-rose-600">{error}</p> : null}
            <FormField label={`${entityLabel} name`}>
              <Input
                value={draft.name}
                onChange={(event) =>
                  setDraft((current) => ({ ...current, name: event.target.value }))
                }
              />
            </FormField>
            <div className="grid gap-4 md:grid-cols-2">
              <FormField label="Timezone">
                <TimezoneSelect
                  value={draft.timezone}
                  onValueChange={(timezone) =>
                    setDraft((current) => ({
                      ...current,
                      timezone,
                    }))
                  }
                />
              </FormField>
              <FormField label="Currency">
                <CurrencySelect
                  value={draft.currency}
                  onValueChange={(currency) =>
                    setDraft((current) => ({
                      ...current,
                      currency,
                    }))
                  }
                />
              </FormField>
            </div>
            {showPrimaryLocation && draft.location ? (
              <div className="mt-2 grid gap-4 rounded-lg border border-stone-200 bg-stone-50 p-4">
                <div>
                  <h4 className="text-lg font-semibold text-stone-950">
                    Primary location
                  </h4>
                  <p className="mt-1 text-sm text-stone-500">
                    This controls the outlet/counter where orders, QR links and
                    staff location access are attached.
                  </p>
                </div>
                <FormField label="Location name">
                  <Input
                    value={draft.location.name}
                    onChange={(event) =>
                      setDraft((current) => ({
                        ...current,
                        location: current.location
                          ? { ...current.location, name: event.target.value }
                          : current.location,
                      }))
                    }
                  />
                </FormField>
                <FormField label="Location label">
                  <Input
                    placeholder="Optional internal label"
                    value={draft.location.label}
                    onChange={(event) =>
                      setDraft((current) => ({
                        ...current,
                        location: current.location
                          ? { ...current.location, label: event.target.value }
                          : current.location,
                      }))
                    }
                  />
                </FormField>
                <div className="grid gap-4 md:grid-cols-2">
                  <FormField label="QR slug">
                    <Input
                      placeholder="main-bar"
                      value={draft.location.qrSlug}
                      onChange={(event) =>
                        setDraft((current) => ({
                          ...current,
                          location: current.location
                            ? {
                                ...current.location,
                                qrSlug: event.target.value.toLowerCase(),
                              }
                            : current.location,
                        }))
                      }
                    />
                  </FormField>
                  <FormField label="Location timezone">
                    <TimezoneSelect
                      value={draft.location.timezone}
                      onValueChange={(timezone) =>
                        setDraft((current) => ({
                          ...current,
                          location: current.location
                            ? { ...current.location, timezone }
                            : current.location,
                        }))
                      }
                    />
                  </FormField>
                </div>
                <label className="flex items-center gap-2 text-sm text-stone-700">
                  <input
                    type="checkbox"
                    checked={draft.location.isActive}
                    onChange={(event) =>
                      setDraft((current) => ({
                        ...current,
                        location: current.location
                          ? { ...current.location, isActive: event.target.checked }
                          : current.location,
                      }))
                    }
                    className="size-4 rounded border-stone-300"
                  />
                  Location is active
                </label>
              </div>
            ) : null}
            <div className="flex flex-wrap gap-3 pt-2">
              <Button
                type="submit"
                disabled={isSaving}
                className="rounded-lg bg-stone-950 text-white hover:bg-stone-800"
              >
                {isSaving ? "Saving..." : "Save changes"}
              </Button>
              <Button asChild type="button" variant="outline" className="rounded-lg">
                <Link href={backHref}>Back</Link>
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <Card className="rounded-xl border-stone-200 bg-white">
        <CardHeader className="px-5 pt-5">
          <h3 className="text-xl font-semibold text-stone-950">Actions</h3>
        </CardHeader>
        <CardContent className="grid gap-4 px-5 pb-5">
          <p className="text-sm leading-6 text-stone-600">
            Disable hides this {entityLabel.toLowerCase()} from active workflows
            without deleting linked staff, locations, menus or orders.
          </p>
          <Button
            type="button"
            variant={draft.isActive ? "destructive" : "outline"}
            disabled={isSaving}
            className="rounded-lg"
            onClick={() => {
              const nextDraft = { ...draft, isActive: !draft.isActive };
              void submitUpdate(nextDraft);
            }}
          >
            {draft.isActive ? `Disable ${entityLabel}` : `Enable ${entityLabel}`}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
