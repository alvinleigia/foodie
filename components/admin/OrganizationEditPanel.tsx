"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { ArrowLeftIcon, PowerIcon, SaveIcon } from "lucide-react";
import { toast } from "sonner";

import { requestJson } from "@/lib/api-client";
import { ButtonLabel } from "@/components/shared/ButtonLabel";
import { FormField } from "@/components/shared/FormField";
import { CurrencySelect, TimezoneSelect } from "@/components/shared/LocaleSelects";
import { StatusPill } from "@/components/shared/StatusPill";
import { useFormValidation } from "@/components/shared/useFormValidation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

type EditableOrganization = {
  id: string;
  name: string;
  slug: string;
  timezone: string;
  currency: string;
  customerCancellationFeeBps?: number;
  isActive: boolean;
};

type OrganizationEditPanelProps = {
  apiPath: string;
  backHref: string;
  entityLabel: string;
  organization: EditableOrganization;
  showCustomerCancellationPolicy?: boolean;
};

type OrganizationEditField =
  | "currency"
  | "customerCancellationFeePercent"
  | "isActive"
  | "name"
  | "timezone";

export function OrganizationEditPanel({
  apiPath,
  backHref,
  entityLabel,
  organization,
  showCustomerCancellationPolicy = false,
}: OrganizationEditPanelProps) {
  const router = useRouter();
  const [draft, setDraft] = useState({
    name: organization.name,
    timezone: organization.timezone,
    currency: organization.currency,
    customerCancellationFeePercent:
      !showCustomerCancellationPolicy
        ? undefined
        : (organization.customerCancellationFeeBps ?? 0) / 100,
    isActive: organization.isActive,
  });
  const [isSaving, setIsSaving] = useState(false);
  const validation = useFormValidation<OrganizationEditField>();

  async function submitUpdate(nextDraft = draft) {
    setIsSaving(true);
    validation.clearErrors();

    try {
      await requestJson(apiPath, {
        body: nextDraft,
        method: "PATCH",
      });
    } catch (caught) {
      const result = validation.applyCaught(caught);
      if (!result.hasFieldErrors) {
        toast.error(result.message);
      }
      setIsSaving(false);
      return;
    }

    validation.clearErrors();
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
            <StatusPill tone={draft.isActive ? "success" : "warning"}>
              {draft.isActive ? "Active" : "Disabled"}
            </StatusPill>
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
            {validation.formError ? (
              <p className="text-sm text-rose-600">{validation.formError}</p>
            ) : null}
            <FormField
              label={`${entityLabel} name`}
              error={validation.getError("name")}
              errorId="organization-name-error"
            >
              <Input
                value={draft.name}
                aria-describedby={
                  validation.getError("name") ? "organization-name-error" : undefined
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
                label="Timezone"
                error={validation.getError("timezone")}
                errorId="organization-timezone-error"
              >
                <TimezoneSelect
                  value={draft.timezone}
                  onValueChange={(timezone) => {
                    validation.clearFieldError("timezone");
                    setDraft((current) => ({
                      ...current,
                      timezone,
                    }));
                  }}
                />
              </FormField>
              <FormField
                label="Currency"
                error={validation.getError("currency")}
                errorId="organization-currency-error"
              >
                <CurrencySelect
                  value={draft.currency}
                  onValueChange={(currency) => {
                    validation.clearFieldError("currency");
                    setDraft((current) => ({
                      ...current,
                      currency,
                    }));
                  }}
                />
              </FormField>
            </div>
            {draft.customerCancellationFeePercent !== undefined ? (
              <FormField
                label="Customer cancellation fee (%)"
                error={validation.getError("customerCancellationFeePercent")}
                errorId="organization-cancellation-fee-error"
              >
                <Input
                  type="number"
                  min="0"
                  max="100"
                  step="0.01"
                  value={draft.customerCancellationFeePercent}
                  aria-describedby={
                    validation.getError("customerCancellationFeePercent")
                      ? "organization-cancellation-fee-error"
                      : undefined
                  }
                  aria-invalid={Boolean(
                    validation.getError("customerCancellationFeePercent"),
                  )}
                  onChange={(event) => {
                    validation.clearFieldError(
                      "customerCancellationFeePercent",
                    );
                    setDraft((current) => ({
                      ...current,
                      customerCancellationFeePercent: event.target.valueAsNumber,
                    }));
                  }}
                />
              </FormField>
            ) : null}
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
                  <ButtonLabel icon={ArrowLeftIcon}>Back</ButtonLabel>
                </Link>
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
            without deleting linked staff, menus or orders.
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
            <ButtonLabel icon={PowerIcon}>
              {draft.isActive ? `Disable ${entityLabel}` : `Enable ${entityLabel}`}
            </ButtonLabel>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
