"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { MapPinPlusIcon, XIcon } from "lucide-react";
import { toast } from "sonner";

import { requestJson } from "@/lib/api-client";
import { ButtonLabel } from "@/components/shared/ButtonLabel";
import { FormField } from "@/components/shared/FormField";
import { TimezoneSelect } from "@/components/shared/LocaleSelects";
import { useFormValidation } from "@/components/shared/useFormValidation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { DEFAULT_TIMEZONE } from "@/lib/locale-defaults";

const emptyLocationDraft = {
  name: "",
  label: "",
  qrSlug: "",
  timezone: DEFAULT_TIMEZONE,
  isActive: true,
};

type CreateLocationFormProps = {
  backHref: string;
  restaurantId: string;
};

type CreateLocationField = "isActive" | "label" | "name" | "qrSlug" | "timezone";

export function CreateLocationForm({ backHref, restaurantId }: CreateLocationFormProps) {
  const router = useRouter();
  const [draft, setDraft] = useState(emptyLocationDraft);
  const validation = useFormValidation<CreateLocationField>();
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function submitLocation() {
    validation.clearErrors();
    setIsSubmitting(true);

    try {
      await requestJson(`/api/company/restaurants/${restaurantId}/locations`, {
        body: draft,
      });
    } catch (caught) {
      const result = validation.applyCaught(caught, "Failed to create location.");
      if (!result.hasFieldErrors) {
        toast.error(result.message);
      }
      setIsSubmitting(false);
      return;
    }

    toast.success("Location created.");
    router.push(backHref);
    router.refresh();
  }

  return (
    <Card className="rounded-xl border-stone-200 bg-white">
      <CardHeader className="px-5 pt-5">
        <h3 className="text-2xl font-semibold text-stone-950">Add location</h3>
        <p className="text-sm text-stone-500">
          Add a branch, counter or service point under this restaurant.
        </p>
      </CardHeader>
      <CardContent className="px-5 pb-5">
        <form
          className="grid gap-4"
          onSubmit={(event) => {
            event.preventDefault();
            void submitLocation();
          }}
        >
          {validation.formError ? (
            <p className="text-sm text-rose-600">{validation.formError}</p>
          ) : null}
          <FormField
            label="Location name"
            error={validation.getError("name")}
            errorId="location-name-error"
          >
            <Input
              value={draft.name}
              aria-describedby={
                validation.getError("name") ? "location-name-error" : undefined
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
              label="Label"
              error={validation.getError("label")}
              errorId="location-label-error"
            >
              <Input
                value={draft.label}
                aria-describedby={
                  validation.getError("label") ? "location-label-error" : undefined
                }
                aria-invalid={Boolean(validation.getError("label"))}
                onChange={(event) => {
                  validation.clearFieldError("label");
                  setDraft((current) => ({ ...current, label: event.target.value }));
                }}
              />
            </FormField>
            <FormField
              label="QR slug"
              error={validation.getError("qrSlug")}
              errorId="location-qr-slug-error"
            >
              <Input
                placeholder="panaji-counter"
                value={draft.qrSlug}
                aria-describedby={
                  validation.getError("qrSlug") ? "location-qr-slug-error" : undefined
                }
                aria-invalid={Boolean(validation.getError("qrSlug"))}
                onChange={(event) => {
                  validation.clearFieldError("qrSlug");
                  setDraft((current) => ({
                    ...current,
                    qrSlug: event.target.value.toLowerCase(),
                  }));
                }}
              />
            </FormField>
          </div>
          <FormField
            label="Timezone"
            error={validation.getError("timezone")}
            errorId="location-timezone-error"
          >
            <TimezoneSelect
              value={draft.timezone}
              onValueChange={(timezone) => {
                validation.clearFieldError("timezone");
                setDraft((current) => ({ ...current, timezone }));
              }}
            />
          </FormField>
          <label className="flex items-center gap-2 text-sm text-stone-700">
            <input
              type="checkbox"
              checked={draft.isActive}
              onChange={(event) =>
                setDraft((current) => ({ ...current, isActive: event.target.checked }))
              }
              className="size-4 rounded border-stone-300"
            />
            Location is active
          </label>
          <div className="flex flex-wrap gap-3 pt-2">
            <Button
              type="submit"
              disabled={isSubmitting}
              className="rounded-lg bg-stone-950 text-white hover:bg-stone-800"
            >
              <ButtonLabel icon={MapPinPlusIcon}>
                {isSubmitting ? "Creating..." : "Create location"}
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
