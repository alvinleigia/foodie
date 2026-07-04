"use client";

import Link from "next/link";
import { useState } from "react";
import {
  MapPinIcon,
  MoreHorizontalIcon,
  PencilIcon,
  SaveIcon,
  UsersIcon,
  XIcon,
} from "lucide-react";
import { toast } from "sonner";

import {
  type FieldErrors,
  getCaughtValidationErrors,
  getFieldError,
  getFirstFieldError,
  hasFieldErrors,
  requestJson,
} from "@/lib/api-client";
import { ButtonLabel } from "@/components/shared/ButtonLabel";
import { DesktopQuickAction } from "@/components/shared/DesktopQuickAction";
import { FormField } from "@/components/shared/FormField";
import { TimezoneSelect } from "@/components/shared/LocaleSelects";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";

type RestaurantLocation = {
  id: string;
  slug: string;
  qrSlug: string | null;
  name: string;
  label: string | null;
  timezone: string;
  isActive: boolean;
};

type LocationDraft = {
  name: string;
  label: string;
  qrSlug: string;
  timezone: string;
  isActive: boolean;
};
type LocationField = keyof LocationDraft & string;

type RestaurantLocationsPanelProps = {
  locations: RestaurantLocation[];
  onRestaurantsChange?: (restaurants: unknown[]) => void;
  restaurantId: string;
};

type LocationSaveResponse = {
  locations?: RestaurantLocation[];
  restaurants?: unknown[];
};

const emptyLocationDraft: LocationDraft = {
  name: "",
  label: "",
  qrSlug: "",
  timezone: "Asia/Calcutta",
  isActive: true,
};

function toDraft(location: RestaurantLocation): LocationDraft {
  return {
    name: location.name,
    label: location.label ?? "",
    qrSlug: location.qrSlug ?? "",
    timezone: location.timezone,
    isActive: location.isActive,
  };
}

export function RestaurantLocationsPanel({
  locations: initialLocations,
  onRestaurantsChange,
  restaurantId,
}: RestaurantLocationsPanelProps) {
  const [locations, setLocations] = useState(initialLocations);
  const [editingLocationId, setEditingLocationId] = useState<string | null>(null);
  const [editDrafts, setEditDrafts] = useState<Record<string, LocationDraft>>(() =>
    Object.fromEntries(initialLocations.map((location) => [location.id, toDraft(location)])),
  );
  const [fieldErrorsByLocation, setFieldErrorsByLocation] = useState<
    Record<string, FieldErrors<LocationField>>
  >({});
  const [formErrorsByLocation, setFormErrorsByLocation] = useState<
    Record<string, string | null>
  >({});
  const [pendingAction, setPendingAction] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function submitLocation(path: string, draft: LocationDraft, action: string) {
    setPendingAction(action);

    let payload: LocationSaveResponse;

    try {
      payload = await requestJson(path, {
        body: draft,
        method: action === "create" ? "POST" : "PATCH",
      });
    } catch (caught) {
      const locationId = action.includes(":") ? action.split(":")[1] : null;
      const validation = getCaughtValidationErrors<LocationField>(caught);
      const message =
        validation.formError ??
        getFirstFieldError(validation.fieldErrors) ??
        "Failed to save location.";

      if (locationId) {
        setFieldErrorsByLocation((current) => ({
          ...current,
          [locationId]: validation.fieldErrors,
        }));
        setFormErrorsByLocation((current) => ({
          ...current,
          [locationId]: validation.formError,
        }));
      }

      setError(hasFieldErrors(validation.fieldErrors) ? null : message);
      toast.error(message);
      setPendingAction(null);
      return;
    }

    const nextLocations = payload.locations ?? [];
    setLocations(nextLocations);
    if (Array.isArray(payload.restaurants)) {
      onRestaurantsChange?.(payload.restaurants);
    }
    setEditDrafts(
      Object.fromEntries(
        nextLocations.map((location: RestaurantLocation) => [
          location.id,
          toDraft(location),
        ]),
      ),
    );
    setEditingLocationId(null);
    setError(null);
    setFieldErrorsByLocation({});
    setFormErrorsByLocation({});
    setPendingAction(null);
    toast.success(action === "create" ? "Location created." : "Location updated.");
  }

  function updateEditDraft(locationId: string, patch: Partial<LocationDraft>) {
    setEditDrafts((current) => ({
      ...current,
      [locationId]: {
        ...(current[locationId] ?? emptyLocationDraft),
        ...patch,
      },
    }));
    setFieldErrorsByLocation((current) => {
      const currentErrors = current[locationId];

      if (!currentErrors) {
        return current;
      }

      const nextErrors = { ...currentErrors };
      for (const field of Object.keys(patch) as LocationField[]) {
        delete nextErrors[field];
      }

      return {
        ...current,
        [locationId]: nextErrors,
      };
    });
    setFormErrorsByLocation((current) => ({ ...current, [locationId]: null }));
  }

  return (
    <div className="grid gap-6">
      <Card className="rounded-xl border-stone-200 bg-white">
        <CardHeader className="flex flex-row items-start justify-between gap-4 px-5 pt-5">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-stone-500">
              Locations
            </p>
            <h3 className="mt-2 text-2xl font-semibold text-stone-950">
              Restaurant locations
            </h3>
            <p className="mt-1 text-sm text-stone-500">
              Add branches, counters or service points under this restaurant.
            </p>
          </div>
          <Button asChild className="rounded-lg">
            <Link href={`/company/restaurants/${restaurantId}/locations/new`}>
              <ButtonLabel icon={MapPinIcon}>Add location</ButtonLabel>
            </Link>
          </Button>
        </CardHeader>
      </Card>

      <Card className="rounded-xl border-stone-200 bg-white">
        <CardHeader className="px-5 pt-5">
          <h3 className="text-xl font-semibold text-stone-950">
            Existing locations
          </h3>
        </CardHeader>
        <CardContent className="grid gap-5 px-5 pb-5">
        {error ? <p className="text-sm text-rose-600">{error}</p> : null}

        <div className="grid gap-3">
          {locations.length === 0 ? (
            <p className="rounded-lg border border-dashed border-stone-200 p-4 text-sm text-stone-500">
              No locations added yet.
            </p>
          ) : null}

          {locations.map((location) => {
            const draft = editDrafts[location.id] ?? toDraft(location);
            const isEditing = editingLocationId === location.id;
            const fieldErrors = fieldErrorsByLocation[location.id] ?? {};
            const formError = formErrorsByLocation[location.id] ?? null;

            return isEditing ? (
              <form
                key={location.id}
                className="grid gap-3 rounded-lg border border-stone-200 bg-white p-4 lg:grid-cols-[1.2fr_1fr_1fr_1fr_auto_auto_auto]"
                onSubmit={(event) => {
                  event.preventDefault();
                  void submitLocation(
                    `/api/company/restaurants/${restaurantId}/locations/${location.id}`,
                    draft,
                    `update:${location.id}`,
                  );
                }}
              >
                <FormField
                  label="Location name"
                  error={getFieldError(fieldErrors, "name")}
                >
                  <Input
                    value={draft.name}
                    onChange={(event) =>
                      updateEditDraft(location.id, { name: event.target.value })
                    }
                  />
                </FormField>
                <FormField label="Label" error={getFieldError(fieldErrors, "label")}>
                  <Input
                    value={draft.label}
                    onChange={(event) =>
                      updateEditDraft(location.id, { label: event.target.value })
                    }
                  />
                </FormField>
                <FormField label="QR slug" error={getFieldError(fieldErrors, "qrSlug")}>
                  <Input
                    value={draft.qrSlug}
                    onChange={(event) =>
                      updateEditDraft(location.id, {
                        qrSlug: event.target.value.toLowerCase(),
                      })
                    }
                  />
                </FormField>
                <FormField
                  label="Timezone"
                  error={getFieldError(fieldErrors, "timezone")}
                >
                  <TimezoneSelect
                    value={draft.timezone}
                    onValueChange={(timezone) =>
                      updateEditDraft(location.id, { timezone })
                    }
                  />
                </FormField>
                <div className="mt-auto grid gap-1">
                  <label className="flex h-8 items-center gap-2 text-sm text-stone-700">
                    <input
                      type="checkbox"
                      checked={draft.isActive}
                      onChange={(event) =>
                        updateEditDraft(location.id, { isActive: event.target.checked })
                      }
                      className="size-4 rounded border-stone-300"
                    />
                    Active
                  </label>
                  {getFieldError(fieldErrors, "isActive") ? (
                    <p className="text-sm text-rose-600">
                      {getFieldError(fieldErrors, "isActive")}
                    </p>
                  ) : null}
                  {formError ? <p className="text-sm text-rose-600">{formError}</p> : null}
                </div>
                <Button
                  type="submit"
                  variant="outline"
                  disabled={Boolean(pendingAction)}
                  className="mt-auto rounded-lg"
                >
                  <ButtonLabel icon={SaveIcon}>
                    {pendingAction === `update:${location.id}` ? "Saving..." : "Save"}
                  </ButtonLabel>
                </Button>
                <Button
                  asChild
                  type="button"
                  variant="outline"
                  className="mt-auto rounded-lg"
                >
                  <Link
                    href={`/company/restaurants/${restaurantId}/locations/${location.id}/staff`}
                  >
                    <ButtonLabel icon={UsersIcon}>Staff</ButtonLabel>
                  </Link>
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  className="mt-auto rounded-lg"
                  onClick={() => setEditingLocationId(null)}
                >
                  <ButtonLabel icon={XIcon}>Cancel</ButtonLabel>
                </Button>
              </form>
            ) : (
              <div
                key={location.id}
                className="flex flex-wrap items-center justify-between gap-4 rounded-lg border border-stone-200 bg-white p-4"
              >
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-semibold text-stone-950">{location.name}</p>
                    <span className="rounded-md border border-stone-200 bg-stone-50 px-2 py-0.5 text-xs font-semibold uppercase tracking-[0.14em] text-stone-500">
                      {location.isActive ? "Active" : "Disabled"}
                    </span>
                  </div>
                  <p className="mt-1 text-sm text-stone-500">
                    {location.label || "No label"} - {location.timezone}
                  </p>
                  <p className="mt-1 text-xs text-stone-400">
                    QR slug: {location.qrSlug || "Not set"}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <DesktopQuickAction
                    icon={PencilIcon}
                    label={`Edit ${location.name}`}
                    onClick={() => setEditingLocationId(location.id)}
                  />
                  <DesktopQuickAction
                    href={`/company/restaurants/${restaurantId}/locations/${location.id}/staff`}
                    icon={UsersIcon}
                    label={`Manage staff for ${location.name}`}
                  />
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        type="button"
                        variant="outline"
                        size="icon"
                        className="rounded-lg border-stone-300 bg-white text-stone-900 hover:bg-stone-100"
                        aria-label={`Open actions for ${location.name}`}
                      >
                        <MoreHorizontalIcon className="size-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="bg-white text-stone-950">
                      <DropdownMenuLabel>Location actions</DropdownMenuLabel>
                      <DropdownMenuItem onSelect={() => setEditingLocationId(location.id)}>
                        Edit location
                      </DropdownMenuItem>
                      <DropdownMenuItem asChild>
                        <Link
                          href={`/company/restaurants/${restaurantId}/locations/${location.id}/staff`}
                        >
                          Manage staff
                        </Link>
                      </DropdownMenuItem>
                      <DropdownMenuSeparator className="bg-stone-200" />
                      <DropdownMenuItem
                        variant={location.isActive ? "destructive" : "default"}
                        onSelect={() =>
                          void submitLocation(
                            `/api/company/restaurants/${restaurantId}/locations/${location.id}`,
                            { ...toDraft(location), isActive: !location.isActive },
                            `toggle:${location.id}`,
                          )
                        }
                      >
                        {location.isActive ? "Disable location" : "Enable location"}
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </div>
            );
          })}
        </div>
        </CardContent>
      </Card>
    </div>
  );
}
