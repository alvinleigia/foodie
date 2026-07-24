"use client";

import { useState } from "react";
import { PencilLineIcon, PlusIcon, SaveIcon, XIcon } from "lucide-react";
import { toast } from "sonner";

import { requestJson } from "@/lib/api-client";
import { ButtonLabel } from "@/components/shared/ButtonLabel";
import { FormField } from "@/components/shared/FormField";
import { NativeSelect } from "@/components/shared/NativeSelect";
import { useFormValidation } from "@/components/shared/useFormValidation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import type { PrepStationRecord } from "@/types/menu";

type ManagedPrepStation = PrepStationRecord & {
  assignedItemCount: number;
};

type PrepStationDraft = {
  id: string | null;
  name: string;
  type: PrepStationRecord["type"];
  sortOrder: string;
  isActive: boolean;
};

type PrepStationField = Exclude<keyof PrepStationDraft, "id"> & string;

const emptyDraft: PrepStationDraft = {
  id: null,
  name: "",
  type: "OTHER",
  sortOrder: "0",
  isActive: true,
};

const stationTypeLabels: Record<PrepStationRecord["type"], string> = {
  KITCHEN: "Kitchen",
  BAR: "Drinks",
  OTHER: "General",
};

export function PrepStationManager({
  initialStations,
}: {
  initialStations: ManagedPrepStation[];
}) {
  const [stations, setStations] =
    useState<ManagedPrepStation[]>(initialStations);
  const [draft, setDraft] = useState<PrepStationDraft>(emptyDraft);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const validation = useFormValidation<PrepStationField>();

  function openCreateDialog() {
    const nextSortOrder =
      stations.reduce(
        (highest, station) => Math.max(highest, station.sortOrder),
        -1,
      ) + 1;

    setDraft({ ...emptyDraft, sortOrder: String(nextSortOrder) });
    validation.clearErrors();
    setIsDialogOpen(true);
  }

  function openEditDialog(station: ManagedPrepStation) {
    setDraft({
      id: station.id,
      name: station.name,
      type: station.type,
      sortOrder: String(station.sortOrder),
      isActive: station.isActive,
    });
    validation.clearErrors();
    setIsDialogOpen(true);
  }

  function updateField<Field extends PrepStationField>(
    field: Field,
    value: PrepStationDraft[Field],
  ) {
    validation.clearFieldError(field);
    setDraft((current) => ({ ...current, [field]: value }));
  }

  async function save() {
    setIsSaving(true);
    validation.clearErrors();

    try {
      const result = await requestJson<{ stations: ManagedPrepStation[] }>(
        draft.id
          ? `/api/tenant/admin/prep-stations/${draft.id}`
          : "/api/tenant/admin/prep-stations",
        {
          method: draft.id ? "PATCH" : "POST",
          body: {
            name: draft.name,
            type: draft.type,
            sortOrder: draft.sortOrder,
            isActive: draft.isActive,
          },
        },
      );

      setStations(result.stations);
      setIsDialogOpen(false);
      toast.success(
        draft.id
          ? "Preparation station updated."
          : "Preparation station added.",
      );
    } catch (caught) {
      const result = validation.applyCaught(caught);

      if (!result.hasFieldErrors) {
        toast.error(result.message);
      }
      setIsSaving(false);
      return;
    }

    setIsSaving(false);
  }

  return (
    <>
      <Card className="rounded-xl border-stone-200 bg-white">
        <CardHeader className="flex flex-row items-start justify-between gap-4 px-5 pt-5">
          <div>
            <h3 className="text-2xl font-semibold text-stone-950">
              Preparation stations
            </h3>
            <p className="text-sm text-stone-500">
              Route products to the work area responsible for preparing them.
            </p>
          </div>
          <Button
            type="button"
            onClick={openCreateDialog}
            className="rounded-lg bg-stone-950 text-white hover:bg-stone-800"
          >
            <ButtonLabel icon={PlusIcon}>Add station</ButtonLabel>
          </Button>
        </CardHeader>
        <CardContent className="px-5 pb-5">
          {stations.length ? (
            <div className="divide-y divide-stone-200 border-y border-stone-200">
              {stations.map((station) => (
                <div
                  key={station.id}
                  className="grid gap-3 py-4 md:grid-cols-[minmax(0,1fr)_auto] md:items-center"
                >
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-semibold text-stone-950">
                        {station.name}
                      </p>
                      <span className="rounded border border-stone-200 px-2 py-0.5 text-xs font-medium text-stone-600">
                        {stationTypeLabels[station.type]}
                      </span>
                      {!station.isActive ? (
                        <span className="rounded border border-stone-200 bg-stone-100 px-2 py-0.5 text-xs font-medium text-stone-500">
                          Inactive
                        </span>
                      ) : null}
                    </div>
                    <p className="mt-1 text-sm text-stone-500">
                      {station.assignedItemCount} assigned product
                      {station.assignedItemCount === 1 ? "" : "s"} / Display
                      order {station.sortOrder}
                    </p>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => openEditDialog(station)}
                  >
                    <ButtonLabel icon={PencilLineIcon}>Edit</ButtonLabel>
                  </Button>
                </div>
              ))}
            </div>
          ) : (
            <p className="rounded-lg border border-dashed border-stone-200 px-4 py-5 text-sm text-stone-500">
              No preparation stations configured.
            </p>
          )}
        </CardContent>
      </Card>

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="max-w-2xl rounded-xl border border-white/70 bg-white p-0">
          <DialogHeader className="px-6 pt-6">
            <DialogTitle className="text-2xl text-stone-950">
              {draft.id ? "Edit station" : "Add station"}
            </DialogTitle>
            <DialogDescription>
              Products assigned to this station appear together on the kitchen
              display.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 px-6 pb-4">
            <FormField
              label="Station name"
              error={validation.getError("name")}
              errorId="prep-station-name-error"
            >
              <Input
                value={draft.name}
                onChange={(event) => updateField("name", event.target.value)}
                placeholder="Desserts"
              />
            </FormField>

            <div className="grid gap-4 md:grid-cols-2">
              <FormField
                label="Station type"
                error={validation.getError("type")}
                errorId="prep-station-type-error"
              >
                <NativeSelect
                  value={draft.type}
                  onChange={(event) =>
                    updateField(
                      "type",
                      event.target.value as PrepStationRecord["type"],
                    )
                  }
                >
                  {Object.entries(stationTypeLabels).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </NativeSelect>
              </FormField>
              <FormField
                label="Display order"
                error={validation.getError("sortOrder")}
                errorId="prep-station-sort-order-error"
              >
                <Input
                  type="number"
                  min="0"
                  max="1000"
                  value={draft.sortOrder}
                  onChange={(event) =>
                    updateField("sortOrder", event.target.value)
                  }
                />
              </FormField>
            </div>

            {draft.id ? (
              <label className="flex items-center gap-3 rounded-lg border border-stone-200 px-4 py-3 text-sm text-stone-700">
                <Checkbox
                  checked={draft.isActive}
                  onCheckedChange={(checked) =>
                    updateField("isActive", checked === true)
                  }
                />
                Active and available for product routing
              </label>
            ) : null}

            {validation.formError ? (
              <p className="text-sm text-rose-600">{validation.formError}</p>
            ) : null}
          </div>
          <DialogFooter className="border-stone-200 bg-stone-50/80">
            <Button
              type="button"
              variant="outline"
              onClick={() => setIsDialogOpen(false)}
            >
              <ButtonLabel icon={XIcon}>Cancel</ButtonLabel>
            </Button>
            <Button
              type="button"
              disabled={isSaving}
              onClick={() => void save()}
              className="bg-stone-950 text-white hover:bg-stone-800"
            >
              <ButtonLabel icon={SaveIcon}>
                {isSaving ? "Saving..." : "Save station"}
              </ButtonLabel>
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
