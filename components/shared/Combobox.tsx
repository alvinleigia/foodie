"use client";

import { CheckIcon, ChevronsUpDownIcon } from "lucide-react";
import { useId, useMemo, useState, type ComponentProps } from "react";

import { Button } from "@/components/ui/button";
import { controlStyles, type ControlSize } from "@/components/ui/control-styles";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";

export type ComboboxOption = {
  value: string;
  label: string;
  searchText?: string;
};

type ComboboxProps = Pick<ComponentProps<"button">, "id" | "disabled" | "aria-label" | "aria-labelledby" | "aria-describedby" | "aria-invalid"> & {
  className?: string;
  controlSize?: ControlSize;
  tone?: "customer" | "default";
  emptyText?: string;
  onValueChange: (value: string) => void;
  options: ComboboxOption[];
  placeholder?: string;
  searchPlaceholder?: string;
  value: string;
};

export function Combobox({
  className,
  controlSize = "default",
  tone = "default",
  emptyText = "No results found.",
  onValueChange,
  options,
  placeholder = "Select option",
  searchPlaceholder = "Search...",
  value,
  ...controlProps
}: ComboboxProps) {
  const [open, setOpen] = useState(false);
  const listId = useId();
  const selectedOption = useMemo(
    () => options.find((option) => option.value === value),
    [options, value],
  );

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          aria-controls={open ? listId : undefined}
          {...controlProps}
          data-control-size={controlSize}
          className={cn(
            controlStyles({ controlSize }),
            "w-full justify-between font-normal hover:bg-muted dark:bg-background dark:hover:bg-muted",
            !selectedOption && "text-muted-foreground",
            className,
          )}
        >
          <span className="truncate">{selectedOption?.label ?? placeholder}</span>
          <ChevronsUpDownIcon className="ml-2 size-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        data-customer-storefront={tone === "customer" ? "" : undefined}
        data-theme-static={tone === "customer" ? "" : undefined}
        align="start"
        className="w-(--radix-popover-trigger-width) p-0"
      >
        <Command filter={(optionValue, search) => {
          const option = options.find((item) => item.value === optionValue);
          const haystack = `${option?.label ?? ""} ${option?.value ?? ""} ${option?.searchText ?? ""}`.toLowerCase();

          return haystack.includes(search.toLowerCase()) ? 1 : 0;
        }}>
          <CommandInput placeholder={searchPlaceholder} />
          <CommandList id={listId}>
            <CommandEmpty>{emptyText}</CommandEmpty>
            <CommandGroup>
              {options.map((option) => (
                <CommandItem
                  key={option.value}
                  value={option.value}
                  onSelect={(nextValue) => {
                    onValueChange(nextValue);
                    setOpen(false);
                  }}
                >
                  <CheckIcon
                    className={cn(
                      "size-4",
                      value === option.value ? "opacity-100" : "opacity-0",
                    )}
                  />
                  <span>{option.label}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
