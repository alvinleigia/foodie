"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { formatRole } from "@/lib/role-access";
import type { MembershipRole } from "@/lib/staff-auth";

type MembershipOption = {
  membershipId: string;
  role: MembershipRole;
  organizationId: string;
  organizationName: string;
  organizationType: "PLATFORM" | "COMPANY" | "RESTAURANT";
  locationId: string | null;
  locationName: string | null;
  locationLabel: string | null;
};

type MembershipPayload = {
  active: {
    organizationId: string;
    locationId: string;
    role: MembershipRole;
  };
  memberships: MembershipOption[];
};

type MembershipSwitcherProps = {
  currentLocationId?: string | null;
  currentOrganizationId?: string | null;
  currentRole?: MembershipRole | null;
};

function getMembershipLabel(option: MembershipOption) {
  if (option.role === "PLATFORM_ADMIN") {
    return "Foodie Platform - Platform access";
  }

  const scope = option.locationId
    ? option.locationLabel || option.locationName || "Location"
    : option.organizationType === "COMPANY"
      ? "Company access"
      : "Restaurant access";

  return `${option.organizationName} - ${scope}`;
}

function getContextKey(option: MembershipOption) {
  if (option.role === "PLATFORM_ADMIN") {
    return "PLATFORM_ADMIN:platform";
  }

  return [
    option.role,
    option.organizationId,
    option.locationId ?? "organization",
  ].join(":");
}

function getUniqueMemberships(memberships: MembershipOption[]) {
  const uniqueMemberships = new Map<string, MembershipOption>();

  for (const membership of memberships) {
    uniqueMemberships.set(getContextKey(membership), membership);
  }

  return Array.from(uniqueMemberships.values());
}

function findActiveMembership(
  memberships: MembershipOption[],
  active: MembershipPayload["active"],
) {
  return (
    memberships.find(
      (membership) =>
        membership.organizationId === active.organizationId &&
        (membership.locationId ?? "") === active.locationId &&
        membership.role === active.role,
    ) ??
    memberships.find(
      (membership) =>
        membership.organizationId === active.organizationId &&
        (membership.locationId ?? "") === active.locationId,
    ) ??
    memberships.find((membership) => membership.organizationId === active.organizationId)
  );
}

export function MembershipSwitcher({
  currentLocationId,
  currentOrganizationId,
  currentRole,
}: MembershipSwitcherProps) {
  const router = useRouter();
  const [payload, setPayload] = useState<MembershipPayload | null>(null);
  const [selectedMembershipId, setSelectedMembershipId] = useState("");
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    async function loadMemberships() {
      const response = await fetch("/api/session/memberships");

      if (!response.ok) {
        return;
      }

      const nextPayload = (await response.json()) as MembershipPayload;
      const active = findActiveMembership(nextPayload.memberships, {
        organizationId: currentOrganizationId || nextPayload.active.organizationId,
        locationId: currentLocationId ?? nextPayload.active.locationId,
        role: currentRole || nextPayload.active.role,
      });

      setPayload(nextPayload);
      setSelectedMembershipId(active?.membershipId ?? "");
    }

    void loadMemberships();
  }, [currentLocationId, currentOrganizationId, currentRole]);

  const selectedMembership = useMemo(() => {
    return payload?.memberships.find(
      (membership) => membership.membershipId === selectedMembershipId,
    );
  }, [payload?.memberships, selectedMembershipId]);

  const uniqueMemberships = useMemo(
    () => (payload ? getUniqueMemberships(payload.memberships) : []),
    [payload],
  );

  if (!payload || uniqueMemberships.length <= 1) {
    return null;
  }

  return (
    <div className="min-w-72">
      <p className="mb-1 text-xs font-semibold uppercase tracking-[0.2em] text-stone-400">
        Access context
      </p>
      <Select
        value={selectedMembershipId}
        disabled={isPending}
        onValueChange={(membershipId) => {
          setSelectedMembershipId(membershipId);

          startTransition(async () => {
            const response = await fetch("/api/session/memberships", {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ membershipId }),
            });
            const body = (await response.json()) as { redirectTo?: string; error?: string };

            if (!response.ok) {
              toast.error(body.error ?? "Could not switch access context.");
              setSelectedMembershipId(selectedMembership?.membershipId ?? "");
              return;
            }

            toast.success("Access context switched.");
            router.push(body.redirectTo ?? "/dashboard");
            router.refresh();
          });
        }}
      >
        <SelectTrigger className="h-auto min-h-10 w-full rounded-lg border-stone-600/60 bg-white/5 px-3 py-2 text-left text-stone-100">
          <SelectValue placeholder="Choose access">
            {selectedMembership ? (
              <span className="flex flex-col items-start gap-0.5">
                <span className="text-sm font-semibold">
                  {getMembershipLabel(selectedMembership)}
                </span>
                <span className="text-xs uppercase tracking-[0.14em] text-stone-400">
                  {formatRole(selectedMembership.role)}
                </span>
              </span>
            ) : null}
          </SelectValue>
        </SelectTrigger>
        <SelectContent className="min-w-80">
          {uniqueMemberships.map((option) => (
            <SelectItem key={option.membershipId} value={option.membershipId}>
              <span className="flex flex-col items-start gap-0.5">
                <span>{getMembershipLabel(option)}</span>
                <span className="text-xs uppercase tracking-[0.14em] text-stone-500">
                  {formatRole(option.role)}
                </span>
              </span>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
