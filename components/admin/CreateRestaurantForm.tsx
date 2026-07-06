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

const emptyRestaurantDraft = {
  name: "",
  timezone: "Asia/Calcutta",
  currency: "INR",
  locationName: "",
  locationLabel: "",
};

type CreateRestaurantFormProps = {
  backHref: string;
};

type CreateRestaurantField =
  | "currency"
  | "locationLabel"
  | "locationName"
  | "name"
  | "timezone";

export function CreateRestaurantForm({ backHref }: CreateRestaurantFormProps) {
  const router = useRouter();
  const [draft, setDraft] = useState(emptyRestaurantDraft);
  const validation = useFormValidation<CreateRestaurantField>();
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function submitRestaurant() {
    validation.clearErrors();
    setIsSubmitting(true);

    try {
      await requestJson("/api/company/restaurants", { body: draft });
    } catch (caught) {
      const result = validation.applyCaught(caught, "Failed to create restaurant.");
      if (!result.hasFieldErrors) {
        toast.error(result.message);
      }
      setIsSubmitting(false);
      return;
    }

    toast.success("Restaurant created.");
    router.push(backHref);
    router.refresh();
  }

  return (
    <Card className="rounded-xl border-stone-200 bg-white">
      <CardHeader className="px-5 pt-5">
        <h3 className="text-2xl font-semibold text-stone-950">Add restaurant</h3>
        <p className="text-sm text-stone-500">
          Create the restaurant and its first operational location.
        </p>
      </CardHeader>
      <CardContent className="px-5 pb-5">
        <form
          className="grid gap-4"
          onSubmit={(event) => {
            event.preventDefault();
            void submitRestaurant();
          }}
        >
          {validation.formError ? (
            <p className="text-sm text-rose-600">{validation.formError}</p>
          ) : null}
          <FormField
            label="Restaurant name"
            error={validation.getError("name")}
            errorId="restaurant-name-error"
          >
            <Input
              value={draft.name}
              aria-describedby={
                validation.getError("name") ? "restaurant-name-error" : undefined
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
              label="First location name"
              error={validation.getError("locationName")}
              errorId="restaurant-location-name-error"
            >
              <Input
                value={draft.locationName}
                aria-describedby={
                  validation.getError("locationName")
                    ? "restaurant-location-name-error"
                    : undefined
                }
                aria-invalid={Boolean(validation.getError("locationName"))}
                onChange={(event) => {
                  validation.clearFieldError("locationName");
                  setDraft((current) => ({
                    ...current,
                    locationName: event.target.value,
                  }));
                }}
              />
            </FormField>
            <FormField
              label="First location label"
              error={validation.getError("locationLabel")}
              errorId="restaurant-location-label-error"
            >
              <Input
                value={draft.locationLabel}
                aria-describedby={
                  validation.getError("locationLabel")
                    ? "restaurant-location-label-error"
                    : undefined
                }
                aria-invalid={Boolean(validation.getError("locationLabel"))}
                onChange={(event) => {
                  validation.clearFieldError("locationLabel");
                  setDraft((current) => ({
                    ...current,
                    locationLabel: event.target.value,
                  }));
                }}
              />
            </FormField>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <FormField
              label="Timezone"
              error={validation.getError("timezone")}
              errorId="restaurant-timezone-error"
            >
              <TimezoneSelect
                value={draft.timezone}
                onValueChange={(timezone) => {
                  validation.clearFieldError("timezone");
                  setDraft((current) => ({ ...current, timezone }));
                }}
              />
            </FormField>
            <FormField
              label="Currency"
              error={validation.getError("currency")}
              errorId="restaurant-currency-error"
            >
              <CurrencySelect
                value={draft.currency}
                onValueChange={(currency) => {
                  validation.clearFieldError("currency");
                  setDraft((current) => ({ ...current, currency }));
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
                {isSubmitting ? "Creating..." : "Create restaurant"}
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
