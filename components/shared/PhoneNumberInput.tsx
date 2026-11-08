"use client";

import {
  parsePhoneNumberFromString,
  type CountryCode,
} from "libphonenumber-js";

import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  countryOptions,
  getCountryCallingCodeLabel,
  isSupportedCountryCode,
} from "@/lib/countries";

type PhoneNumberInputProps = {
  ariaDescribedBy?: string;
  ariaInvalid?: boolean;
  autoComplete?: string;
  controlSize?: "compact" | "default" | "lg" | "xl";
  countryCode: CountryCode;
  disabled?: boolean;
  id?: string;
  onCountryCodeChange: (countryCode: CountryCode) => void;
  onValueChange: (value: string) => void;
  tone?: "customer" | "default";
  value: string;
};

export function PhoneNumberInput({
  ariaDescribedBy,
  ariaInvalid,
  autoComplete = "tel",
  controlSize = "default",
  countryCode,
  disabled,
  id,
  onCountryCodeChange,
  onValueChange,
  tone = "default",
  value,
}: PhoneNumberInputProps) {
  const selectSize =
    controlSize === "lg" || controlSize === "xl" ? controlSize : "default";

  return (
    <div className="grid grid-cols-[6.25rem_minmax(0,1fr)] gap-2">
      <Select
        value={countryCode}
        disabled={disabled}
        onValueChange={(nextCountryCode) => {
          if (isSupportedCountryCode(nextCountryCode)) {
            onCountryCodeChange(nextCountryCode);
          }
        }}
      >
        <SelectTrigger
          aria-label="Phone country"
          className="w-full"
          size={selectSize}
        >
          <SelectValue>{getCountryCallingCodeLabel(countryCode)}</SelectValue>
        </SelectTrigger>
        <SelectContent
          data-customer-storefront={tone === "customer" ? "" : undefined}
          data-theme-static={tone === "customer" ? "" : undefined}
          className="max-h-80 min-w-[19rem]"
          position="popper"
        >
          {countryOptions.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Input
        id={id}
        type="tel"
        inputMode="tel"
        autoComplete={autoComplete}
        placeholder={countryCode === "GB" ? "07123 456789" : "Phone number"}
        value={value}
        disabled={disabled}
        aria-invalid={ariaInvalid}
        aria-describedby={ariaDescribedBy}
        controlSize={controlSize}
        onChange={(event) => {
          const nextValue = event.target.value;
          onValueChange(nextValue);

          if (nextValue.trim().startsWith("+")) {
            const detectedCountryCode = parsePhoneNumberFromString(nextValue)?.country;

            if (detectedCountryCode) {
              onCountryCodeChange(detectedCountryCode);
            }
          }
        }}
      />
    </div>
  );
}
