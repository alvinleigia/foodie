"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { MapPinPlusIcon, XIcon } from "lucide-react";
import { toast } from "sonner";

import { getCaughtErrorMessage, requestJson } from "@/lib/api-client";
import { ButtonLabel } from "@/components/shared/ButtonLabel";
import { FormField } from "@/components/shared/FormField";
import { TimezoneSelect } from "@/components/shared/LocaleSelects";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

const emptyLocationDraft = {
  name: "",
  label: "",
  qrSlug: "",
  timezone: "Asia/Calcutta",
  isActive: true,
};

type CreateLocationFormProps = {
  backHref: string;
  restaurantId: string;
};

export function CreateLocationForm({ backHref, restaurantId }: CreateLocationFormProps) {
  const router = useRouter();
  const [draft, setDraft] = useState(emptyLocationDraft);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function submitLocation() {
    setIsSubmitting(true);

    try {
      await requestJson(`/api/company/restaurants/${restaurantId}/locations`, {
        body: draft,
      });
    } catch (caught) {
      const message = getCaughtErrorMessage(caught);
      setError(message);
      toast.error(message);
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
          {error ? <p className="text-sm text-rose-600">{error}</p> : null}
          <FormField label="Location name">
            <Input
              value={draft.name}
              onChange={(event) =>
                setDraft((current) => ({ ...current, name: event.target.value }))
              }
            />
          </FormField>
          <div className="grid gap-4 md:grid-cols-2">
            <FormField label="Label">
              <Input
                value={draft.label}
                onChange={(event) =>
                  setDraft((current) => ({ ...current, label: event.target.value }))
                }
              />
            </FormField>
            <FormField label="QR slug">
              <Input
                placeholder="panaji-counter"
                value={draft.qrSlug}
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    qrSlug: event.target.value.toLowerCase(),
                  }))
                }
              />
            </FormField>
          </div>
          <FormField label="Timezone">
            <TimezoneSelect
              value={draft.timezone}
              onValueChange={(timezone) =>
                setDraft((current) => ({ ...current, timezone }))
              }
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
