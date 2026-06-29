"use client";

import Link from "next/link";
import { useState } from "react";
import { MoreHorizontalIcon } from "lucide-react";
import { toast } from "sonner";

import { getApiError } from "@/lib/api-client";
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

type RestaurantLocationsPanelProps = {
  locations: RestaurantLocation[];
  onRestaurantsChange?: (restaurants: unknown[]) => void;
  restaurantId: string;
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
  const [pendingAction, setPendingAction] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function submitLocation(path: string, draft: LocationDraft, action: string) {
    setPendingAction(action);
    const response = await fetch(path, {
      method: action === "create" ? "POST" : "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(draft),
    });
    const payload = await response.json();

    if (!response.ok) {
      const message = getApiError(payload);
      setError(message);
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
              Add location
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
                <FormField label="Location name">
                  <Input
                    value={draft.name}
                    onChange={(event) =>
                      updateEditDraft(location.id, { name: event.target.value })
                    }
                  />
                </FormField>
                <FormField label="Label">
                  <Input
                    value={draft.label}
                    onChange={(event) =>
                      updateEditDraft(location.id, { label: event.target.value })
                    }
                  />
                </FormField>
                <FormField label="QR slug">
                  <Input
                    value={draft.qrSlug}
                    onChange={(event) =>
                      updateEditDraft(location.id, {
                        qrSlug: event.target.value.toLowerCase(),
                      })
                    }
                  />
                </FormField>
                <FormField label="Timezone">
                  <TimezoneSelect
                    value={draft.timezone}
                    onValueChange={(timezone) =>
                      updateEditDraft(location.id, { timezone })
                    }
                  />
                </FormField>
                <label className="mt-auto flex h-8 items-center gap-2 text-sm text-stone-700">
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
                <Button
                  type="submit"
                  variant="outline"
                  disabled={Boolean(pendingAction)}
                  className="mt-auto rounded-lg"
                >
                  {pendingAction === `update:${location.id}` ? "Saving..." : "Save"}
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
                    Staff
                  </Link>
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  className="mt-auto rounded-lg"
                  onClick={() => setEditingLocationId(null)}
                >
                  Cancel
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
            );
          })}
        </div>
        </CardContent>
      </Card>
    </div>
  );
}
