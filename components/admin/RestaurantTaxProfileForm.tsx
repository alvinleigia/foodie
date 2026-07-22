"use client";

import { useState } from "react";
import { SaveIcon } from "lucide-react";
import { toast } from "sonner";

import { requestJson } from "@/lib/api-client";
import { ButtonLabel } from "@/components/shared/ButtonLabel";
import { FormField } from "@/components/shared/FormField";
import { useFormValidation } from "@/components/shared/useFormValidation";
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
import type {
  taxRegistrationStatuses,
  taxSystems,
} from "@/lib/validations/restaurant-tax-profile";

type TaxSystem = (typeof taxSystems)[number];
type TaxRegistrationStatus = (typeof taxRegistrationStatuses)[number];
type TaxPricingMode = "INCLUSIVE" | "EXCLUSIVE";

type RestaurantTaxProfile = {
  taxSystem: TaxSystem;
  pricingMode: TaxPricingMode;
  registrationStatus: TaxRegistrationStatus;
  registrationNumber: string | null;
  legalName: string | null;
  addressLine1: string | null;
  addressLine2: string | null;
  city: string | null;
  region: string | null;
  postalCode: string | null;
  countryCode: string | null;
  defaultTaxRateBps: number;
} | null;

type TaxProfileField =
  | "addressLine1"
  | "addressLine2"
  | "city"
  | "countryCode"
  | "defaultTaxRatePercent"
  | "legalName"
  | "postalCode"
  | "pricingMode"
  | "region"
  | "registrationNumber"
  | "registrationStatus"
  | "taxSystem";

const taxSystemOptions: Array<{ label: string; value: TaxSystem }> = [
  { label: "No tax registration", value: "NONE" },
  { label: "VAT", value: "VAT" },
  { label: "GST", value: "GST" },
  { label: "Sales tax", value: "SALES_TAX" },
  { label: "Other", value: "OTHER" },
];

const registrationStatusOptions: Array<{
  label: string;
  value: TaxRegistrationStatus;
}> = [
  { label: "Not registered", value: "NOT_REGISTERED" },
  { label: "Registration pending", value: "PENDING" },
  { label: "Registered", value: "REGISTERED" },
];

const pricingModeOptions: Array<{
  label: string;
  value: TaxPricingMode;
}> = [
  { label: "Prices include tax", value: "INCLUSIVE" },
  { label: "Add tax at checkout", value: "EXCLUSIVE" },
];

export function RestaurantTaxProfileForm({
  apiPath,
  profile,
}: {
  apiPath: string;
  profile: RestaurantTaxProfile;
}) {
  const [draft, setDraft] = useState({
    taxSystem: profile?.taxSystem ?? ("NONE" as TaxSystem),
    pricingMode: profile?.pricingMode ?? ("INCLUSIVE" as TaxPricingMode),
    registrationStatus:
      profile?.registrationStatus ?? ("NOT_REGISTERED" as TaxRegistrationStatus),
    registrationNumber: profile?.registrationNumber ?? "",
    legalName: profile?.legalName ?? "",
    addressLine1: profile?.addressLine1 ?? "",
    addressLine2: profile?.addressLine2 ?? "",
    city: profile?.city ?? "",
    region: profile?.region ?? "",
    postalCode: profile?.postalCode ?? "",
    countryCode: profile?.countryCode ?? "",
    defaultTaxRatePercent: (profile?.defaultTaxRateBps ?? 0) / 100,
  });
  const [isSaving, setIsSaving] = useState(false);
  const validation = useFormValidation<TaxProfileField>();
  const hasTaxSystem = draft.taxSystem !== "NONE";

  function updateField<Field extends TaxProfileField>(
    field: Field,
    value: (typeof draft)[Field],
  ) {
    validation.clearFieldError(field);
    setDraft((current) => ({ ...current, [field]: value }));
  }

  async function save() {
    setIsSaving(true);
    validation.clearErrors();

    try {
      await requestJson(apiPath, { body: draft, method: "PATCH" });
      toast.success("Tax profile updated.");
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
    <Card className="rounded-xl border-stone-200 bg-white">
      <CardHeader className="px-5 pt-5">
        <h3 className="text-2xl font-semibold text-stone-950">Tax profile</h3>
        <p className="text-sm text-stone-500">
          Registration and legal details for this restaurant.
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

          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            <FormField
              label="Tax system"
              error={validation.getError("taxSystem")}
              errorId="restaurant-tax-system-error"
            >
              <Select
                value={draft.taxSystem}
                onValueChange={(value) => {
                  const taxSystem = value as TaxSystem;
                  validation.clearFieldError("taxSystem");
                  setDraft((current) => ({
                    ...current,
                    taxSystem,
                    ...(taxSystem === "NONE"
                      ? {
                          defaultTaxRatePercent: 0,
                          pricingMode: "INCLUSIVE" as const,
                          registrationStatus: "NOT_REGISTERED" as const,
                        }
                      : {}),
                  }));
                }}
              >
                <SelectTrigger className="bg-white">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {taxSystemOptions.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </FormField>

            <FormField
              label="Menu price treatment"
              error={validation.getError("pricingMode")}
              errorId="restaurant-tax-pricing-mode-error"
            >
              <Select
                value={draft.pricingMode}
                disabled={!hasTaxSystem}
                onValueChange={(value) =>
                  updateField("pricingMode", value as TaxPricingMode)
                }
              >
                <SelectTrigger className="bg-white">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {pricingModeOptions.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </FormField>

            <FormField
              label="Registration status"
              error={validation.getError("registrationStatus")}
              errorId="restaurant-tax-registration-status-error"
            >
              <Select
                value={draft.registrationStatus}
                disabled={!hasTaxSystem}
                onValueChange={(value) =>
                  updateField(
                    "registrationStatus",
                    value as TaxRegistrationStatus,
                  )
                }
              >
                <SelectTrigger className="bg-white">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {registrationStatusOptions.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </FormField>

            <FormField
              label="Default tax rate (%)"
              error={validation.getError("defaultTaxRatePercent")}
              errorId="restaurant-default-tax-rate-error"
            >
              <Input
                type="number"
                min="0"
                max="100"
                step="0.01"
                value={draft.defaultTaxRatePercent}
                disabled={!hasTaxSystem}
                aria-invalid={Boolean(
                  validation.getError("defaultTaxRatePercent"),
                )}
                onChange={(event) =>
                  updateField(
                    "defaultTaxRatePercent",
                    event.target.valueAsNumber,
                  )
                }
              />
            </FormField>
          </div>

          {hasTaxSystem ? (
            <>
              <div className="grid gap-4 md:grid-cols-2">
                <FormField
                  label="Registered legal name"
                  error={validation.getError("legalName")}
                  errorId="restaurant-tax-legal-name-error"
                >
                  <Input
                    value={draft.legalName}
                    onChange={(event) =>
                      updateField("legalName", event.target.value)
                    }
                  />
                </FormField>
                <FormField
                  label="Registration number"
                  error={validation.getError("registrationNumber")}
                  errorId="restaurant-tax-registration-number-error"
                >
                  <Input
                    value={draft.registrationNumber}
                    onChange={(event) =>
                      updateField("registrationNumber", event.target.value)
                    }
                  />
                </FormField>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <FormField
                  label="Registered address line 1"
                  error={validation.getError("addressLine1")}
                  errorId="restaurant-tax-address-line-1-error"
                >
                  <Input
                    value={draft.addressLine1}
                    onChange={(event) =>
                      updateField("addressLine1", event.target.value)
                    }
                  />
                </FormField>
                <FormField
                  label="Address line 2"
                  error={validation.getError("addressLine2")}
                  errorId="restaurant-tax-address-line-2-error"
                >
                  <Input
                    value={draft.addressLine2}
                    onChange={(event) =>
                      updateField("addressLine2", event.target.value)
                    }
                  />
                </FormField>
              </div>

              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                <FormField
                  label="City"
                  error={validation.getError("city")}
                  errorId="restaurant-tax-city-error"
                >
                  <Input
                    value={draft.city}
                    onChange={(event) => updateField("city", event.target.value)}
                  />
                </FormField>
                <FormField
                  label="Region"
                  error={validation.getError("region")}
                  errorId="restaurant-tax-region-error"
                >
                  <Input
                    value={draft.region}
                    onChange={(event) =>
                      updateField("region", event.target.value)
                    }
                  />
                </FormField>
                <FormField
                  label="Postal code"
                  error={validation.getError("postalCode")}
                  errorId="restaurant-tax-postal-code-error"
                >
                  <Input
                    value={draft.postalCode}
                    onChange={(event) =>
                      updateField("postalCode", event.target.value)
                    }
                  />
                </FormField>
                <FormField
                  label="Country code"
                  error={validation.getError("countryCode")}
                  errorId="restaurant-tax-country-code-error"
                >
                  <Input
                    value={draft.countryCode}
                    maxLength={2}
                    placeholder="GB"
                    onChange={(event) =>
                      updateField(
                        "countryCode",
                        event.target.value.toUpperCase(),
                      )
                    }
                  />
                </FormField>
              </div>
            </>
          ) : null}

          <div className="flex flex-wrap gap-3 pt-2">
            <Button
              type="submit"
              disabled={isSaving}
              className="rounded-lg bg-stone-950 text-white hover:bg-stone-800"
            >
              <ButtonLabel icon={SaveIcon}>
                {isSaving ? "Saving..." : "Save tax profile"}
              </ButtonLabel>
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
