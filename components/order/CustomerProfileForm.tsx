"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { SaveIcon } from "lucide-react";
import { toast } from "sonner";

import { ButtonLabel } from "@/components/shared/ButtonLabel";
import { FormField } from "@/components/shared/FormField";
import { Spinner } from "@/components/shared/Spinner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  getCaughtValidationErrors,
  getFieldError,
  requestJson,
  type FieldErrors,
} from "@/lib/api-client";

type CustomerProfileField =
  | "dateOfBirth"
  | "gender"
  | "marketingOptIn"
  | "name"
  | "phone";

type CustomerProfileFormProps = {
  customer: {
    dateOfBirth: string | null;
    email: string;
    gender: string | null;
    marketingOptIn: boolean;
    name: string;
    phone: string | null;
  };
};

export function CustomerProfileForm({ customer }: CustomerProfileFormProps) {
  const router = useRouter();
  const [profile, setProfile] = useState({
    dateOfBirth: customer.dateOfBirth ?? "",
    gender: customer.gender ?? "",
    marketingOptIn: customer.marketingOptIn,
    name: customer.name,
    phone: customer.phone ?? "",
  });
  const [fieldErrors, setFieldErrors] = useState<FieldErrors<CustomerProfileField>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  function updateField<TField extends CustomerProfileField>(
    field: TField,
    value: (typeof profile)[TField],
  ) {
    setProfile((current) => ({ ...current, [field]: value }));
    setFieldErrors((current) => ({ ...current, [field]: undefined }));
    setFormError(null);
  }

  async function submitProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSaving(true);
    setFieldErrors({});
    setFormError(null);

    try {
      await requestJson("/api/customer/profile", {
        body: profile,
        fallbackError: "Profile could not be saved.",
        method: "PATCH",
      });
      toast.success("Profile saved.");
      router.refresh();
    } catch (error) {
      const validation = getCaughtValidationErrors<CustomerProfileField>(
        error,
        "Profile could not be saved.",
      );
      setFieldErrors(validation.fieldErrors);
      setFormError(validation.formError);
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <form onSubmit={submitProfile} className="grid gap-5">
      <div className="grid gap-5 sm:grid-cols-2">
        <FormField
          label="Name"
          error={getFieldError(fieldErrors, "name")}
          htmlFor="customer-name"
        >
          <Input
            id="customer-name"
            value={profile.name}
            onChange={(event) => updateField("name", event.target.value)}
            disabled={isSaving}
            className="h-11 bg-white"
          />
        </FormField>

        <FormField label="Email" htmlFor="customer-email">
          <Input
            id="customer-email"
            type="email"
            value={customer.email}
            readOnly
            className="h-11 bg-stone-100 text-stone-600"
          />
        </FormField>

        <FormField
          label="Phone"
          description="Include the country code, for example +91 98765 43210."
          error={getFieldError(fieldErrors, "phone")}
          htmlFor="customer-phone"
        >
          <Input
            id="customer-phone"
            type="tel"
            value={profile.phone}
            onChange={(event) => updateField("phone", event.target.value)}
            placeholder="+91 98765 43210"
            autoComplete="tel"
            disabled={isSaving}
            className="h-11 bg-white"
          />
        </FormField>

        <FormField
          label="Birthday"
          error={getFieldError(fieldErrors, "dateOfBirth")}
          htmlFor="customer-birthday"
        >
          <Input
            id="customer-birthday"
            type="date"
            value={profile.dateOfBirth}
            max={new Date().toISOString().slice(0, 10)}
            onChange={(event) => updateField("dateOfBirth", event.target.value)}
            disabled={isSaving}
            className="h-11 bg-white"
          />
        </FormField>

        <FormField
          label="Gender"
          error={getFieldError(fieldErrors, "gender")}
          htmlFor="customer-gender"
          className="sm:col-span-2"
        >
          <Select
            value={profile.gender || "UNSPECIFIED"}
            onValueChange={(value) =>
              updateField("gender", value === "UNSPECIFIED" ? "" : value)
            }
            disabled={isSaving}
          >
            <SelectTrigger id="customer-gender" className="h-11 w-full bg-white">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="UNSPECIFIED">Not specified</SelectItem>
              <SelectItem value="WOMAN">Woman</SelectItem>
              <SelectItem value="MAN">Man</SelectItem>
              <SelectItem value="NON_BINARY">Non-binary</SelectItem>
              <SelectItem value="PREFER_NOT_TO_SAY">Prefer not to say</SelectItem>
            </SelectContent>
          </Select>
        </FormField>
      </div>

      <label
        htmlFor="customer-marketing"
        className="flex items-start gap-3 border-t border-stone-200 pt-5 text-sm text-stone-700"
      >
        <Checkbox
          id="customer-marketing"
          checked={profile.marketingOptIn}
          onCheckedChange={(checked) => updateField("marketingOptIn", checked === true)}
          disabled={isSaving}
          className="mt-0.5"
        />
        <span>Send me occasional offers and restaurant updates.</span>
      </label>

      {formError ? <p className="text-sm text-rose-600">{formError}</p> : null}

      <div className="flex justify-end">
        <Button type="submit" disabled={isSaving} className="min-h-11 px-5">
          {isSaving ? (
            <span className="inline-flex items-center gap-2">
              <Spinner className="text-white" />
              Saving...
            </span>
          ) : (
            <ButtonLabel icon={SaveIcon}>Save profile</ButtonLabel>
          )}
        </Button>
      </div>
    </form>
  );
}
