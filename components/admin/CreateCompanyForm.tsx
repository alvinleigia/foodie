"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

import { getCaughtErrorMessage, requestJson } from "@/lib/api-client";
import { FormField } from "@/components/shared/FormField";
import { CurrencySelect, TimezoneSelect } from "@/components/shared/LocaleSelects";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

const emptyCompanyDraft = {
  name: "",
  timezone: "Asia/Calcutta",
  currency: "INR",
};

type CreateCompanyFormProps = {
  backHref: string;
};

export function CreateCompanyForm({ backHref }: CreateCompanyFormProps) {
  const router = useRouter();
  const [draft, setDraft] = useState(emptyCompanyDraft);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function submitCompany() {
    setIsSubmitting(true);

    try {
      await requestJson("/api/platform/companies", { body: draft });
    } catch (caught) {
      const message = getCaughtErrorMessage(caught);
      setError(message);
      toast.error(message);
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
          {error ? <p className="text-sm text-rose-600">{error}</p> : null}
          <FormField label="Company name">
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
          <div className="flex flex-wrap gap-3 pt-2">
            <Button
              type="submit"
              disabled={isSubmitting}
              className="rounded-lg bg-stone-950 text-white hover:bg-stone-800"
            >
              {isSubmitting ? "Creating..." : "Create company"}
            </Button>
            <Button asChild type="button" variant="outline" className="rounded-lg">
              <Link href={backHref}>Cancel</Link>
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
