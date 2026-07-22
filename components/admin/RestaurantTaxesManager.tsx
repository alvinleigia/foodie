"use client";

import { useEffect, useState } from "react";
import { PencilLineIcon, PlusIcon, SaveIcon, XIcon } from "lucide-react";
import { toast } from "sonner";

import { fetchJson, requestJson } from "@/lib/api-client";
import { ButtonLabel } from "@/components/shared/ButtonLabel";
import { FormField } from "@/components/shared/FormField";
import { NativeSelect } from "@/components/shared/NativeSelect";
import { Spinner } from "@/components/shared/Spinner";
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
import type { RestaurantTaxDefinitionRecord, TaxTreatment } from "@/types/tax";

type TaxConfiguration = {
  businessDate: string;
  definitions: RestaurantTaxDefinitionRecord[];
};

type TaxDraft = {
  id: string | null;
  code: string;
  name: string;
  treatment: TaxTreatment;
  ratePercent: string;
  effectiveFrom: string;
  calculationOrder: string;
  isCompound: boolean;
  isDefault: boolean;
  isActive: boolean;
};

type TaxField = Exclude<keyof TaxDraft, "id"> & string;

const emptyDraft: TaxDraft = {
  id: null,
  code: "",
  name: "",
  treatment: "TAXABLE",
  ratePercent: "0",
  effectiveFrom: "",
  calculationOrder: "0",
  isCompound: false,
  isDefault: false,
  isActive: true,
};

const treatmentLabels: Record<TaxTreatment, string> = {
  TAXABLE: "Taxable",
  ZERO_RATED: "Zero-rated",
  EXEMPT: "Exempt",
  OUT_OF_SCOPE: "Out of scope",
};

function formatRate(rateBps: number | null) {
  return rateBps === null ? "No active rate" : `${rateBps / 100}%`;
}

export function RestaurantTaxesManager({ apiPath }: { apiPath: string }) {
  const [configuration, setConfiguration] =
    useState<TaxConfiguration | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState<TaxDraft>(emptyDraft);
  const validation = useFormValidation<TaxField>();

  useEffect(() => {
    async function load() {
      try {
        const result = await fetchJson<TaxConfiguration>(apiPath);
        setConfiguration(result);
        setError(null);
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : "Failed to load taxes.");
      }

      setIsLoading(false);
    }

    void load();
  }, [apiPath]);

  function openCreateDialog() {
    setDraft({
      ...emptyDraft,
      effectiveFrom:
        configuration?.businessDate ?? new Date().toISOString().slice(0, 10),
    });
    validation.clearErrors();
    setIsDialogOpen(true);
  }

  function openEditDialog(definition: RestaurantTaxDefinitionRecord) {
    setDraft({
      id: definition.id,
      code: definition.code,
      name: definition.name,
      treatment: definition.treatment,
      ratePercent: String((definition.rateBps ?? 0) / 100),
      effectiveFrom:
        configuration?.businessDate ?? new Date().toISOString().slice(0, 10),
      calculationOrder: String(definition.calculationOrder),
      isCompound: definition.isCompound,
      isDefault: definition.isDefault,
      isActive: definition.isActive,
    });
    validation.clearErrors();
    setIsDialogOpen(true);
  }

  function updateField<Field extends TaxField>(
    field: Field,
    value: TaxDraft[Field],
  ) {
    validation.clearFieldError(field);
    setDraft((current) => ({ ...current, [field]: value }));
  }

  async function save() {
    setIsSaving(true);
    validation.clearErrors();

    try {
      const result = await requestJson<TaxConfiguration>(
        draft.id ? `${apiPath}/${draft.id}` : apiPath,
        {
          method: draft.id ? "PATCH" : "POST",
          body: {
            code: draft.code,
            name: draft.name,
            treatment: draft.treatment,
            ratePercent: draft.ratePercent,
            effectiveFrom: draft.effectiveFrom,
            calculationOrder: draft.calculationOrder,
            isCompound: draft.isCompound,
            isDefault: draft.isDefault,
            isActive: draft.isActive,
          },
        },
      );
      setConfiguration(result);
      setIsDialogOpen(false);
      toast.success(draft.id ? "Tax updated." : "Tax added.");
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
            <h3 className="text-2xl font-semibold text-stone-950">Tax rates</h3>
            <p className="text-sm text-stone-500">
              Add named taxes and choose which ones apply to menu items by default.
            </p>
          </div>
          <Button
            type="button"
            onClick={openCreateDialog}
            disabled={isLoading}
            className="rounded-lg bg-stone-950 text-white hover:bg-stone-800"
          >
            <ButtonLabel icon={PlusIcon}>Add tax</ButtonLabel>
          </Button>
        </CardHeader>
        <CardContent className="px-5 pb-5">
          {isLoading ? (
            <div className="flex items-center gap-2 py-5 text-sm text-stone-500">
              <Spinner /> Loading taxes...
            </div>
          ) : error ? (
            <p className="py-4 text-sm text-rose-600">{error}</p>
          ) : configuration?.definitions.length ? (
            <div className="divide-y divide-stone-200 border-y border-stone-200">
              {configuration.definitions.map((definition) => (
                <div
                  key={definition.id}
                  className="grid gap-3 py-4 md:grid-cols-[minmax(0,1fr)_auto] md:items-center"
                >
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-semibold text-stone-950">
                        {definition.name}
                      </p>
                      <span className="rounded border border-stone-200 px-2 py-0.5 text-xs font-medium text-stone-600">
                        {definition.code}
                      </span>
                      {definition.isDefault ? (
                        <span className="rounded border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700">
                          Restaurant default
                        </span>
                      ) : null}
                      {!definition.isActive ? (
                        <span className="rounded border border-stone-200 bg-stone-100 px-2 py-0.5 text-xs font-medium text-stone-500">
                          Inactive
                        </span>
                      ) : null}
                    </div>
                    <p className="mt-1 text-sm text-stone-500">
                      {formatRate(definition.rateBps)} / {treatmentLabels[definition.treatment]}
                      {definition.isCompound ? " / Compound" : ""} / Assigned to {definition.assignedItemCount} item(s)
                    </p>
                  </div>
                  {definition.isProfileDefault ? (
                    <span className="text-sm text-stone-500">
                      Managed in Tax profile
                    </span>
                  ) : (
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => openEditDialog(definition)}
                    >
                      <ButtonLabel icon={PencilLineIcon}>Edit</ButtonLabel>
                    </Button>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <p className="rounded-lg border border-dashed border-stone-200 px-4 py-5 text-sm text-stone-500">
              Enable and save the Tax profile, then add any additional taxes here.
            </p>
          )}
        </CardContent>
      </Card>

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="max-w-2xl rounded-xl border border-white/70 bg-white p-0">
          <DialogHeader className="px-6 pt-6">
            <DialogTitle className="text-2xl text-stone-950">
              {draft.id ? "Edit tax" : "Add tax"}
            </DialogTitle>
            <DialogDescription>
              Rate changes start on the effective date. Existing orders keep their original tax snapshots.
            </DialogDescription>
          </DialogHeader>
          <div className="grid max-h-[calc(100vh-15rem)] gap-4 overflow-y-auto px-6 pb-4">
            <div className="grid gap-4 md:grid-cols-2">
              <FormField
                label="Tax name"
                error={validation.getError("name")}
                errorId="tax-definition-name-error"
              >
                <Input
                  value={draft.name}
                  onChange={(event) => updateField("name", event.target.value)}
                />
              </FormField>
              <FormField
                label="Tax code"
                error={validation.getError("code")}
                errorId="tax-definition-code-error"
              >
                <Input
                  value={draft.code}
                  maxLength={32}
                  placeholder="CITY_TAX"
                  onChange={(event) =>
                    updateField("code", event.target.value.toUpperCase())
                  }
                />
              </FormField>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <FormField
                label="Treatment"
                error={validation.getError("treatment")}
                errorId="tax-definition-treatment-error"
              >
                <NativeSelect
                  value={draft.treatment}
                  onChange={(event) => {
                    const treatment = event.target.value as TaxTreatment;
                    validation.clearFieldError("treatment");
                    validation.clearFieldError("ratePercent");
                    setDraft((current) => ({
                      ...current,
                      treatment,
                      ...(treatment === "TAXABLE" ? {} : { ratePercent: "0" }),
                    }));
                  }}
                >
                  {Object.entries(treatmentLabels).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </NativeSelect>
              </FormField>
              <FormField
                label="Rate (%)"
                error={validation.getError("ratePercent")}
                errorId="tax-definition-rate-error"
              >
                <Input
                  type="number"
                  min="0"
                  max="100"
                  step="0.01"
                  value={draft.ratePercent}
                  disabled={draft.treatment !== "TAXABLE"}
                  onChange={(event) =>
                    updateField("ratePercent", event.target.value)
                  }
                />
              </FormField>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <FormField
                label="Effective from"
                error={validation.getError("effectiveFrom")}
                errorId="tax-definition-effective-date-error"
              >
                <Input
                  type="date"
                  value={draft.effectiveFrom}
                  onChange={(event) =>
                    updateField("effectiveFrom", event.target.value)
                  }
                />
              </FormField>
              <FormField
                label="Calculation order"
                error={validation.getError("calculationOrder")}
                errorId="tax-definition-order-error"
              >
                <Input
                  type="number"
                  min="0"
                  max="1000"
                  value={draft.calculationOrder}
                  onChange={(event) =>
                    updateField("calculationOrder", event.target.value)
                  }
                />
              </FormField>
            </div>

            {validation.formError ? (
              <p className="text-sm text-rose-600">{validation.formError}</p>
            ) : null}

            <label className="flex items-center gap-3 rounded-lg border border-stone-200 px-4 py-3 text-sm text-stone-700">
              <Checkbox
                checked={draft.isDefault}
                onCheckedChange={(checked) =>
                  updateField("isDefault", checked === true)
                }
              />
              Apply this tax to menu items that inherit restaurant defaults
            </label>
            <label className="flex items-center gap-3 rounded-lg border border-stone-200 px-4 py-3 text-sm text-stone-700">
              <Checkbox
                checked={draft.isCompound}
                onCheckedChange={(checked) =>
                  updateField("isCompound", checked === true)
                }
              />
              Calculate this tax after earlier tax components
            </label>
            {draft.id ? (
              <label className="flex items-center gap-3 rounded-lg border border-stone-200 px-4 py-3 text-sm text-stone-700">
                <Checkbox
                  checked={draft.isActive}
                  onCheckedChange={(checked) =>
                    updateField("isActive", checked === true)
                  }
                />
                Active and available for new orders
              </label>
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
                {isSaving ? "Saving..." : "Save tax"}
              </ButtonLabel>
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
