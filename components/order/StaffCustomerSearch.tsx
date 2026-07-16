"use client";

import { useState, type FormEvent } from "react";
import { SearchIcon, UserRoundCheckIcon, XIcon } from "lucide-react";

import { ButtonLabel } from "@/components/shared/ButtonLabel";
import { Spinner } from "@/components/shared/Spinner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { fetchJson, getCaughtErrorMessage } from "@/lib/api-client";
import { withStaffRestaurantContext } from "@/lib/staff-restaurant-navigation";

export type StaffCustomerSummary = {
  email: string;
  id: string;
  name: string;
  phone: string | null;
};

type StaffCustomerSearchProps = {
  onChange: (customer: StaffCustomerSummary | null) => void;
  selectedCustomer: StaffCustomerSummary | null;
  staffRestaurantSlug?: string;
};

export function StaffCustomerSearch({
  onChange,
  selectedCustomer,
  staffRestaurantSlug,
}: StaffCustomerSearchProps) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<StaffCustomerSummary[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isSearching, setIsSearching] = useState(false);

  async function search(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (query.trim().length < 2) {
      setError("Enter at least two characters to search.");
      return;
    }

    setIsSearching(true);
    setError(null);

    try {
      const payload = await fetchJson<{ customers: StaffCustomerSummary[] }>(
        withStaffRestaurantContext(
          `/api/customer/search?q=${encodeURIComponent(query.trim())}`,
          staffRestaurantSlug,
        ),
        { fallbackError: "Customers could not be searched." },
      );
      setResults(payload.customers);
    } catch (searchError) {
      setError(getCaughtErrorMessage(searchError, "Customers could not be searched."));
      setResults([]);
    } finally {
      setIsSearching(false);
    }
  }

  if (selectedCustomer) {
    return (
      <div className="-mx-6 flex flex-wrap items-center justify-between gap-3 border-y border-stone-200 bg-sky-50 px-6 py-4">
        <div className="flex min-w-0 items-start gap-3">
          <UserRoundCheckIcon className="mt-0.5 size-5 shrink-0 text-sky-700" />
          <div className="min-w-0">
            <p className="font-semibold text-sky-950">{selectedCustomer.name}</p>
            <p className="truncate text-sm text-sky-800">
              {selectedCustomer.phone || selectedCustomer.email}
            </p>
          </div>
        </div>
        <Button
          type="button"
          variant="ghost"
          onClick={() => onChange(null)}
          className="text-sky-900 hover:bg-sky-100"
          title="Remove linked customer"
        >
          <XIcon />
          Remove
        </Button>
      </div>
    );
  }

  return (
    <div className="-mx-6 grid gap-3 border-y border-stone-200 bg-stone-50 px-6 py-5">
      <div>
        <p className="font-semibold text-stone-950">Link a customer (optional)</p>
        <p className="mt-1 text-sm text-stone-600">
          Search previous customers by name, email, or phone.
        </p>
      </div>
      <form onSubmit={search} className="flex gap-2">
        <Input
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
            setError(null);
          }}
          placeholder="Search customers"
          aria-label="Search customers"
          disabled={isSearching}
          className="h-11 bg-white"
        />
        <Button type="submit" disabled={isSearching} className="h-11 px-4">
          {isSearching ? <Spinner className="text-white" /> : <SearchIcon />}
          <span className="sr-only">Search</span>
        </Button>
      </form>
      {error ? <p className="text-sm text-rose-600">{error}</p> : null}
      {results.length > 0 ? (
        <div className="divide-y divide-stone-200 border-y border-stone-200">
          {results.map((customer) => (
            <button
              key={customer.id}
              type="button"
              onClick={() => onChange(customer)}
              className="flex w-full items-center justify-between gap-4 px-1 py-3 text-left hover:bg-white"
            >
              <span className="min-w-0">
                <span className="block font-medium text-stone-900">{customer.name}</span>
                <span className="block truncate text-sm text-stone-500">
                  {customer.phone || customer.email}
                </span>
              </span>
              <ButtonLabel icon={UserRoundCheckIcon}>Select</ButtonLabel>
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
