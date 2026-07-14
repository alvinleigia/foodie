"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { PlusIcon, XIcon } from "lucide-react";
import { toast } from "sonner";

import { requestJson } from "@/lib/api-client";
import { ButtonLabel } from "@/components/shared/ButtonLabel";
import { FormField } from "@/components/shared/FormField";
import { CurrencySelect, TimezoneSelect } from "@/components/shared/LocaleSelects";
import { useFormValidation } from "@/components/shared/useFormValidation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { DEFAULT_CURRENCY, DEFAULT_TIMEZONE } from "@/lib/locale-defaults";

const emptyCompanyDraft = {
  name: "",
  timezone: DEFAULT_TIMEZONE,
  currency: DEFAULT_CURRENCY,
};

type CreateCompanyFormProps = {
  backHref: string;
};

type CreateCompanyField = "currency" | "name" | "timezone";

export function CreateCompanyForm({ backHref }: CreateCompanyFormProps) {
  const router = useRouter();
  const [draft, setDraft] = useState(emptyCompanyDraft);
  const validation = useFormValidation<CreateCompanyField>();
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function submitCompany() {
    validation.clearErrors();
    setIsSubmitting(true);

    try {
      await requestJson("/api/platform/companies", { body: draft });
    } catch (caught) {
      const result = validation.applyCaught(caught, "Failed to create company.");
      if (!result.hasFieldErrors) {
        toast.error(result.message);
      }
      setIsSubmitting(false);
      return;
    }

    toast.success("Company created.");
    router.push(backHref);
    router.refresh();
  }

  return (
    <Card className="rounded-xl border-stone-200 bg-white">
      <CardHeader className="px-5 pt-5">
        <h3 className="text-2xl font-semibold text-stone-950">Add company</h3>
        <p className="text-sm text-stone-500">
          Create a parent company tenant. Company users can be invited after the company exists.
        </p>
      </CardHeader>
      <CardContent className="px-5 pb-5">
        <form
          className="grid gap-4"
          onSubmit={(event) => {
            event.preventDefault();
            void submitCompany();
          }}
        >
          {validation.formError ? (
            <p className="text-sm text-rose-600">{validation.formError}</p>
          ) : null}
          <FormField
            label="Company name"
            error={validation.getError("name")}
            errorId="company-name-error"
          >
            <Input
              value={draft.name}
              aria-describedby={
                validation.getError("name") ? "company-name-error" : undefined
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
              errorId="company-timezone-error"
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
              errorId="company-currency-error"
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
          <div className="flex flex-wrap gap-3 pt-2">
            <Button
              type="submit"
              disabled={isSubmitting}
              className="rounded-lg bg-stone-950 text-white hover:bg-stone-800"
            >
              <ButtonLabel icon={PlusIcon}>
                {isSubmitting ? "Creating..." : "Create company"}
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
