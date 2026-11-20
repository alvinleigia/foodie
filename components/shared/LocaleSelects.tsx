"use client";

import {
  currencyOptions,
  timezoneOptions,
  type LocaleOption,
} from "@/data/locale-options";
import { Combobox } from "@/components/shared/Combobox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import type { ComponentProps } from "react";
import type { ControlSize } from "@/components/ui/control-styles";

type LocaleSelectProps = Pick<ComponentProps<"button">, "id" | "disabled" | "aria-label" | "aria-labelledby" | "aria-describedby" | "aria-invalid"> & {
  className?: string;
  controlSize?: ControlSize;
  tone?: "customer" | "default";
  onValueChange: (value: string) => void;
  value: string;
};

function optionsWithCurrentValue(options: LocaleOption[], currentValue: string) {
  if (!currentValue || options.some((option) => option.value === currentValue)) {
    return options;
  }

  return [
    {
      value: currentValue,
      label: `${currentValue} (saved value)`,
    },
    ...options,
  ];
}

function LocaleSelect({
  className,
  options,
  placeholder,
  value,
  onValueChange,
  controlSize = "default",
  tone = "default",
  disabled,
  ...controlProps
}: LocaleSelectProps & {
  options: LocaleOption[];
  placeholder: string;
}) {
  return (
    <Select value={value} onValueChange={onValueChange} disabled={disabled}>
      <SelectTrigger {...controlProps} size={controlSize} className={cn("w-full", className)}>
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent data-customer-storefront={tone === "customer" ? "" : undefined} data-theme-static={tone === "customer" ? "" : undefined} className="max-h-80 min-w-[18rem]" position="popper">
        {optionsWithCurrentValue(options, value).map((option) => (
          <SelectItem key={option.value} value={option.value}>
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

export function TimezoneSelect(props: LocaleSelectProps) {
  return (
    <Combobox
      {...props}
      options={optionsWithCurrentValue(timezoneOptions, props.value).map(
        (option) => ({
          ...option,
          searchText: option.value.replaceAll("_", " ").replaceAll("/", " "),
        }),
      )}
      placeholder="Choose timezone"
      searchPlaceholder="Search timezone, city or region..."
      emptyText="No timezone found."
    />
  );
}

export function CurrencySelect(props: LocaleSelectProps) {
  return (
    <LocaleSelect
      {...props}
      options={currencyOptions}
      placeholder="Choose currency"
    />
  );
}
