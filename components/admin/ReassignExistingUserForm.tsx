"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { ShieldAlertIcon, UserCheckIcon, XIcon } from "lucide-react";
import { toast } from "sonner";

import { requestJson } from "@/lib/api-client";
import { ButtonLabel } from "@/components/shared/ButtonLabel";
import { FormField } from "@/components/shared/FormField";
import { useFormValidation } from "@/components/shared/useFormValidation";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogMedia,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
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

type AssignableRestaurant = {
  id: string;
  name: string;
  slug: string;
  isActive: boolean;
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
  defaultDeactivateExisting?: boolean;
  initialCompanyId?: string;
  initialIdentifier?: string;
  initialRestaurantId?: string;
  initialRole?: ReassignRole;
  roleOptions?: Array<{ label: string; value: ReassignRole }>;
  targets: AssignableCompany[];
  users: ReassignableUser[];
};

type ReassignRole = Extract<
  MembershipRole,
  "COMPANY_OWNER" | "RESTAURANT_MANAGER" | "ORDER_OPERATOR"
>;

const roles: Array<{ label: string; value: ReassignRole }> = [
  { label: "Company Owner", value: "COMPANY_OWNER" },
  { label: "Restaurant Manager", value: "RESTAURANT_MANAGER" },
  { label: "Order Operator", value: "ORDER_OPERATOR" },
];

type ReassignField =
  | "deactivateExisting"
  | "identifier"
  | "organizationId"
  | "role";

function isCompanyRole(role: ReassignRole) {
  return role === "COMPANY_OWNER";
}

function getRoleLabel(role: ReassignRole, roleOptions: Array<{ label: string; value: ReassignRole }>) {
  return roleOptions.find((roleOption) => roleOption.value === role)?.label ?? role;
}

export function ReassignExistingUserForm({
  apiPath = "/api/platform/users/reassign",
  backHref,
  defaultDeactivateExisting = true,
  initialCompanyId,
  initialIdentifier,
  initialRestaurantId,
  initialRole,
  roleOptions = roles,
  targets,
  users,
}: ReassignExistingUserFormProps) {
  const router = useRouter();
  const defaultCompany =
    targets.find((company) => company.id === initialCompanyId) ?? targets[0];
  const defaultRestaurant =
    defaultCompany?.restaurants.find((restaurant) => restaurant.id === initialRestaurantId) ??
    defaultCompany?.restaurants[0];
  const [identifier, setIdentifier] = useState(initialIdentifier ?? "");
  const [isIdentifierFocused, setIsIdentifierFocused] = useState(false);
  const [role, setRole] = useState<ReassignRole>(
    initialRole ?? roleOptions[0]?.value ?? "ORDER_OPERATOR",
  );
  const [companyId, setCompanyId] = useState(defaultCompany?.id ?? "");
  const [restaurantId, setRestaurantId] = useState(defaultRestaurant?.id ?? "");
  const [deactivateExisting, setDeactivateExisting] = useState(defaultDeactivateExisting);
  const validation = useFormValidation<ReassignField>();
  const [isConfirmOpen, setIsConfirmOpen] = useState(false);
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

    validation.clearFieldError("organizationId");
    setCompanyId(nextCompanyId);
    setRestaurantId(nextRestaurant?.id ?? "");
  }

  function changeRestaurant(nextRestaurantId: string) {
    validation.clearFieldError("organizationId");
    setRestaurantId(nextRestaurantId);
  }

  function chooseUser(user: ReassignableUser) {
    validation.clearFieldError("identifier");
    setIdentifier(user.email);
    setIsIdentifierFocused(false);
  }

  async function submitReassignment() {
    validation.clearErrors();
    setIsSubmitting(true);
    const companyRole = isCompanyRole(role);

    try {
      await requestJson(apiPath, {
        body: {
          identifier,
          role,
          organizationId: companyRole ? activeCompanyId : activeRestaurantId,
          deactivateExisting,
        },
      });
    } catch (caught) {
      const result = validation.applyCaught(caught, "Failed to reassign user.");
      if (!result.hasFieldErrors) {
        toast.error(result.message);
      }
      setIsSubmitting(false);
      return;
    }

    setIdentifier("");
    validation.clearErrors();
    setIsSubmitting(false);
    toast.success("User reassigned.");
    setIsConfirmOpen(false);
    router.replace(backHref);
  }

  const companyRole = isCompanyRole(role);
  const targetLabel = companyRole
    ? selectedCompany?.name
    : selectedRestaurant?.name ?? "Selected restaurant";
  const deactivationLabel = deactivateExisting
    ? companyRole
      ? "Current active memberships in scope will be disabled before this access is enabled."
      : "Other active restaurant memberships in scope will be disabled. Company owner access will stay active."
    : "Existing memberships will stay active and this access will be added alongside them.";
  const canSubmit =
    identifier.trim().length >= 3 &&
    (companyRole
      ? Boolean(activeCompanyId)
      : Boolean(activeRestaurantId));

  return (
    <Card className="rounded-xl border-stone-200 bg-white">
      <CardHeader className="px-5 pt-5">
        <h3 className="text-2xl font-semibold text-stone-950">
          Reassign existing user
        </h3>
        <p className="text-sm text-stone-500">
          Move future access to a new company or restaurant without moving old history.
        </p>
      </CardHeader>
      <CardContent className="px-5 pb-5">
        <form
          className="grid gap-4"
          onSubmit={(event) => {
            event.preventDefault();
            if (canSubmit) {
              setIsConfirmOpen(true);
            }
          }}
        >
          {validation.formError ? (
            <p className="text-sm text-rose-600">{validation.formError}</p>
          ) : null}
          <FormField
            label="Existing email or username"
            error={validation.getError("identifier")}
            errorId="reassign-identifier-error"
          >
            <div className="relative">
              <Input
                value={identifier}
                aria-describedby={
                  validation.getError("identifier")
                    ? "reassign-identifier-error"
                    : undefined
                }
                aria-invalid={Boolean(validation.getError("identifier"))}
                onChange={(event) => {
                  validation.clearFieldError("identifier");
                  setIdentifier(event.target.value);
                }}
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

          <FormField
            label="New role"
            error={validation.getError("role")}
            errorId="reassign-role-error"
          >
            <Select
              value={role}
              onValueChange={(value) => {
                validation.clearFieldError("role");
                setRole(value as ReassignRole);
              }}
            >
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

          <FormField
            label="Target company"
            error={companyRole ? validation.getError("organizationId") : null}
            errorId="reassign-company-error"
          >
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
            <FormField
              label="Target restaurant"
              error={validation.getError("organizationId")}
              errorId="reassign-restaurant-error"
            >
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
          ) : null}

          <div className="rounded-lg border border-stone-200 bg-stone-50 p-4">
            <label className="flex items-start gap-3 text-sm text-stone-700">
              <input
                type="checkbox"
                checked={deactivateExisting}
                aria-describedby={
                  validation.getError("deactivateExisting")
                    ? "reassign-deactivate-error"
                    : undefined
                }
                aria-invalid={Boolean(validation.getError("deactivateExisting"))}
                onChange={(event) => {
                  validation.clearFieldError("deactivateExisting");
                  setDeactivateExisting(event.target.checked);
                }}
                className="mt-1 size-4 rounded border-stone-300"
              />
              <span>
                <span className="block font-medium text-stone-950">
                  Disable current active memberships
                </span>
                <span className="mt-1 block text-stone-500">
                  Keep this enabled when a user is moving from one company or
                  restaurant to another. Their old history remains unchanged.
                </span>
              </span>
            </label>
            {validation.getError("deactivateExisting") ? (
              <p id="reassign-deactivate-error" className="mt-2 text-sm text-rose-600">
                {validation.getError("deactivateExisting")}
              </p>
            ) : null}
          </div>

          <div className="flex flex-wrap gap-3 pt-2">
            <Button
              type="submit"
              disabled={isSubmitting || !canSubmit}
              className="rounded-lg bg-stone-950 text-white hover:bg-stone-800"
            >
              <ButtonLabel icon={UserCheckIcon}>
                {isSubmitting ? "Reassigning..." : "Reassign User"}
              </ButtonLabel>
            </Button>
            <Button asChild type="button" variant="outline" className="rounded-lg">
              <Link href={backHref}>
                <ButtonLabel icon={XIcon}>Cancel</ButtonLabel>
              </Link>
            </Button>
          </div>
        </form>
        <AlertDialog open={isConfirmOpen} onOpenChange={setIsConfirmOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogMedia>
                <ShieldAlertIcon className="size-5" />
              </AlertDialogMedia>
              <AlertDialogTitle>Confirm access change</AlertDialogTitle>
              <AlertDialogDescription>
                You are about to assign {identifier || "this user"} as{" "}
                {getRoleLabel(role, roleOptions)} for {targetLabel}. {deactivationLabel}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={isSubmitting}>Go Back</AlertDialogCancel>
              <AlertDialogAction
                disabled={isSubmitting}
                onClick={() => void submitReassignment()}
              >
                <ButtonLabel icon={UserCheckIcon}>
                  {isSubmitting ? "Reassigning..." : "Confirm Reassignment"}
                </ButtonLabel>
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </CardContent>
    </Card>
  );
}
