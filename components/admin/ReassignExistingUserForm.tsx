"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { toast } from "sonner";

import { getCaughtErrorMessage, requestJson } from "@/lib/api-client";
import { FormField } from "@/components/shared/FormField";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { MembershipRole } from "@/lib/staff-auth";

type AssignableLocation = {
  id: string;
  name: string;
  label: string | null;
  slug: string;
  isActive: boolean;
};

type AssignableRestaurant = {
  id: string;
  name: string;
  slug: string;
  isActive: boolean;
  locations: AssignableLocation[];
};

type AssignableCompany = {
  id: string;
  name: string;
  slug: string;
  isActive: boolean;
  restaurants: AssignableRestaurant[];
};

type ReassignableUser = {
  id: string;
  username: string;
  name: string;
  email: string;
};

type ReassignExistingUserFormProps = {
  apiPath?: string;
  backHref: string;
  initialCompanyId?: string;
  initialIdentifier?: string;
  initialLocationId?: string;
  initialRestaurantId?: string;
  initialRole?: ReassignRole;
  roleOptions?: Array<{ label: string; value: ReassignRole }>;
  targets: AssignableCompany[];
  users: ReassignableUser[];
};

type ReassignRole = Extract<
  MembershipRole,
  "COMPANY_OWNER" | "COMPANY_MANAGER" | "RESTAURANT_MANAGER" | "ORDER_OPERATOR"
>;

const roles: Array<{ label: string; value: ReassignRole }> = [
  { label: "Company Owner", value: "COMPANY_OWNER" },
  { label: "Company Manager", value: "COMPANY_MANAGER" },
  { label: "Restaurant Manager", value: "RESTAURANT_MANAGER" },
  { label: "Order Operator", value: "ORDER_OPERATOR" },
];

function isCompanyRole(role: ReassignRole) {
  return role === "COMPANY_OWNER" || role === "COMPANY_MANAGER";
}

export function ReassignExistingUserForm({
  apiPath = "/api/platform/users/reassign",
  backHref,
  initialCompanyId,
  initialIdentifier,
  initialLocationId,
  initialRestaurantId,
  initialRole,
  roleOptions = roles,
  targets,
  users,
}: ReassignExistingUserFormProps) {
  const defaultCompany =
    targets.find((company) => company.id === initialCompanyId) ?? targets[0];
  const defaultRestaurant =
    defaultCompany?.restaurants.find((restaurant) => restaurant.id === initialRestaurantId) ??
    defaultCompany?.restaurants[0];
  const defaultLocation =
    defaultRestaurant?.locations.find((location) => location.id === initialLocationId) ??
    defaultRestaurant?.locations[0];

  const [identifier, setIdentifier] = useState(initialIdentifier ?? "");
  const [isIdentifierFocused, setIsIdentifierFocused] = useState(false);
  const [role, setRole] = useState<ReassignRole>(
    initialRole ?? roleOptions[0]?.value ?? "ORDER_OPERATOR",
  );
  const [companyId, setCompanyId] = useState(defaultCompany?.id ?? "");
  const [restaurantId, setRestaurantId] = useState(defaultRestaurant?.id ?? "");
  const [locationId, setLocationId] = useState(defaultLocation?.id ?? "");
  const [deactivateExisting, setDeactivateExisting] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const selectedCompany = useMemo(
    () => targets.find((company) => company.id === companyId) ?? targets[0],
    [companyId, targets],
  );
  const activeCompanyId = selectedCompany?.id ?? "";
  const restaurants = useMemo(
    () => selectedCompany?.restaurants ?? [],
    [selectedCompany],
  );
  const selectedRestaurant = useMemo(
    () =>
      restaurants.find((restaurant) => restaurant.id === restaurantId) ??
      restaurants[0],
    [restaurantId, restaurants],
  );
  const activeRestaurantId = selectedRestaurant?.id ?? "";
  const locations = selectedRestaurant?.locations ?? [];
  const selectedLocation =
    locations.find((location) => location.id === locationId) ?? locations[0];
  const activeLocationId = selectedLocation?.id ?? "";
  const userQuery = identifier.trim().toLowerCase();
  const userSuggestions = useMemo(() => {
    if (!userQuery) {
      return [];
    }

    return users
      .filter((user) =>
        [user.name, user.username, user.email].some((value) =>
          value.toLowerCase().includes(userQuery),
        ),
      )
      .slice(0, 6);
  }, [userQuery, users]);
  const showUserSuggestions = isIdentifierFocused && userQuery.length > 0;

  function changeCompany(nextCompanyId: string) {
    const nextCompany = targets.find((company) => company.id === nextCompanyId);
    const nextRestaurant = nextCompany?.restaurants[0];

    setCompanyId(nextCompanyId);
    setRestaurantId(nextRestaurant?.id ?? "");
    setLocationId(nextRestaurant?.locations[0]?.id ?? "");
  }

  function changeRestaurant(nextRestaurantId: string) {
    const nextRestaurant = restaurants.find(
      (restaurant) => restaurant.id === nextRestaurantId,
    );

    setRestaurantId(nextRestaurantId);
    setLocationId(nextRestaurant?.locations[0]?.id ?? "");
  }

  function chooseUser(user: ReassignableUser) {
    setIdentifier(user.email);
    setIsIdentifierFocused(false);
  }

  async function submitReassignment() {
    setIsSubmitting(true);
    const companyRole = isCompanyRole(role);

    try {
      await requestJson(apiPath, {
        body: {
          identifier,
          role,
          organizationId: companyRole ? activeCompanyId : activeRestaurantId,
          locationId: companyRole ? null : activeLocationId,
          deactivateExisting,
        },
      });
    } catch (caught) {
      const message = getCaughtErrorMessage(caught);
      setError(message);
      toast.error(message);
      setIsSubmitting(false);
      return;
    }

    setIdentifier("");
    setError(null);
    setIsSubmitting(false);
    toast.success("User reassigned.");
  }

  const companyRole = isCompanyRole(role);
  const canSubmit =
    identifier.trim().length >= 3 &&
    (companyRole
      ? Boolean(activeCompanyId)
      : Boolean(activeRestaurantId && activeLocationId));

  return (
    <Card className="rounded-xl border-stone-200 bg-white">
      <CardHeader className="px-5 pt-5">
        <h3 className="text-2xl font-semibold text-stone-950">
          Reassign existing user
        </h3>
        <p className="text-sm text-stone-500">
          Move future access to a new company or location without moving old history.
        </p>
      </CardHeader>
      <CardContent className="px-5 pb-5">
        <form
          className="grid gap-4"
          onSubmit={(event) => {
            event.preventDefault();
            void submitReassignment();
          }}
        >
          {error ? <p className="text-sm text-rose-600">{error}</p> : null}
          <FormField label="Existing email or username">
            <div className="relative">
              <Input
                value={identifier}
                onChange={(event) => setIdentifier(event.target.value)}
                onFocus={() => setIsIdentifierFocused(true)}
                onBlur={() => setIsIdentifierFocused(false)}
                placeholder="Start typing a name, email or username"
                autoComplete="off"
                role="combobox"
                aria-expanded={showUserSuggestions}
                aria-controls="reassign-user-suggestions"
              />
              {showUserSuggestions ? (
                <div
                  id="reassign-user-suggestions"
                  role="listbox"
                  className="absolute left-0 right-0 top-full z-30 mt-2 overflow-hidden rounded-lg border border-stone-200 bg-white shadow-[0_16px_50px_rgba(40,26,20,0.14)]"
                >
                  {userSuggestions.length > 0 ? (
                    userSuggestions.map((user) => (
                      <button
                        key={user.id}
                        type="button"
                        role="option"
                        aria-selected={
                          identifier.toLowerCase() === user.email.toLowerCase() ||
                          identifier.toLowerCase() === user.username.toLowerCase()
                        }
                        className="flex w-full flex-col gap-1 px-4 py-3 text-left text-sm transition hover:bg-stone-100 focus:bg-stone-100 focus:outline-none"
                        onMouseDown={(event) => {
                          event.preventDefault();
                          chooseUser(user);
                        }}
                      >
                        <span className="font-semibold text-stone-950">
                          {user.name}
                        </span>
                        <span className="text-xs text-stone-500">
                          {user.username} - {user.email}
                        </span>
                      </button>
                    ))
                  ) : (
                    <div className="px-4 py-3 text-sm text-stone-500">
                      No accepted active users match this search.
                    </div>
                  )}
                </div>
              ) : null}
            </div>
          </FormField>

          <FormField label="New role">
            <Select value={role} onValueChange={(value) => setRole(value as ReassignRole)}>
              <SelectTrigger className="bg-white">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {roleOptions.map((roleOption) => (
                  <SelectItem key={roleOption.value} value={roleOption.value}>
                    {roleOption.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FormField>

          <FormField label="Target company">
            <Select value={activeCompanyId} onValueChange={changeCompany}>
              <SelectTrigger className="bg-white">
                <SelectValue placeholder="Choose company" />
              </SelectTrigger>
              <SelectContent>
                {targets.map((company) => (
                  <SelectItem key={company.id} value={company.id}>
                    {company.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FormField>

          {!companyRole ? (
            <div className="grid gap-4 md:grid-cols-2">
              <FormField label="Target restaurant">
                <Select value={activeRestaurantId} onValueChange={changeRestaurant}>
                  <SelectTrigger className="bg-white">
                    <SelectValue placeholder="Choose restaurant" />
                  </SelectTrigger>
                  <SelectContent>
                    {restaurants.map((restaurant) => (
                      <SelectItem key={restaurant.id} value={restaurant.id}>
                        {restaurant.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </FormField>
              <FormField label="Target location">
                <Select value={activeLocationId} onValueChange={setLocationId}>
                  <SelectTrigger className="bg-white">
                    <SelectValue placeholder="Choose location" />
                  </SelectTrigger>
                  <SelectContent>
                    {locations.map((location) => (
                      <SelectItem key={location.id} value={location.id}>
                        {location.name}
                        {location.label ? ` - ${location.label}` : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </FormField>
            </div>
          ) : null}

          <div className="rounded-lg border border-stone-200 bg-stone-50 p-4">
            <label className="flex items-start gap-3 text-sm text-stone-700">
              <input
                type="checkbox"
                checked={deactivateExisting}
                onChange={(event) => setDeactivateExisting(event.target.checked)}
                className="mt-1 size-4 rounded border-stone-300"
              />
              <span>
                <span className="block font-medium text-stone-950">
                  Disable current active memberships
                </span>
                <span className="mt-1 block text-stone-500">
                  Keep this enabled when a user is moving from one company or
                  location to another. Their old history remains unchanged.
                </span>
              </span>
            </label>
          </div>

          <div className="flex flex-wrap gap-3 pt-2">
            <Button
              type="submit"
              disabled={isSubmitting || !canSubmit}
              className="rounded-lg bg-stone-950 text-white hover:bg-stone-800"
            >
              {isSubmitting ? "Reassigning..." : "Reassign User"}
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
