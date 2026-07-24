"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { fetchJson, getCaughtErrorMessage, requestJson } from "@/lib/api-client";
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
};

type MembershipPayload = {
  active: {
    organizationId: string;
    role: MembershipRole;
  };
  memberships: MembershipOption[];
};

type MembershipSwitchResponse = {
  error?: string;
  redirectTo?: string;
};

type MembershipSwitcherProps = {
  contextName?: string | null;
  currentOrganizationId?: string | null;
  currentRole?: MembershipRole | null;
  placement?: "account-menu" | "standalone";
  redirectAfterSwitch?: string;
};

function getContextKey(option: MembershipOption) {
  if (option.role === "PLATFORM_ADMIN") {
    return "PLATFORM_ADMIN:platform";
  }

  return [option.role, option.organizationId].join(":");
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
        membership.role === active.role,
    ) ??
    memberships.find(
      (membership) => membership.organizationId === active.organizationId,
    )
  );
}

export function MembershipSwitcher({
  contextName,
  currentOrganizationId,
  currentRole,
  placement = "standalone",
  redirectAfterSwitch,
}: MembershipSwitcherProps) {
  const router = useRouter();
  const [payload, setPayload] = useState<MembershipPayload | null>(null);
  const [selectedMembershipId, setSelectedMembershipId] = useState("");
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    async function loadMemberships() {
      let nextPayload: MembershipPayload;

      try {
        nextPayload = await fetchJson<MembershipPayload>("/api/session/memberships");
      } catch {
        return;
      }

      const active = findActiveMembership(nextPayload.memberships, {
        organizationId: currentOrganizationId || nextPayload.active.organizationId,
        role: currentRole || nextPayload.active.role,
      });

      setPayload(nextPayload);
      setSelectedMembershipId(active?.membershipId ?? "");
    }

    void loadMemberships();
  }, [currentOrganizationId, currentRole]);

  const selectedMembership = useMemo(() => {
    return payload?.memberships.find(
      (membership) => membership.membershipId === selectedMembershipId,
    );
  }, [payload?.memberships, selectedMembershipId]);

  const uniqueMemberships = useMemo(
    () => (payload ? getUniqueMemberships(payload.memberships) : []),
    [payload],
  );

  if (placement === "standalone" && (!payload || uniqueMemberships.length <= 1)) {
    return null;
  }

  const displayedContextName =
    selectedMembership?.organizationName ?? contextName ?? "Current access";
  const displayedRole = selectedMembership?.role ?? currentRole;
  const canSwitchMembership = uniqueMemberships.length > 1;

  return (
    <div className={placement === "account-menu" ? "min-w-0" : "min-w-72"}>
      {placement === "standalone" ? (
        <p className="mb-1 text-xs font-semibold uppercase tracking-[0.2em] text-stone-400">
          Access context
        </p>
      ) : null}
      <Select
        value={selectedMembershipId || undefined}
        disabled={isPending || !canSwitchMembership}
        onValueChange={(membershipId) => {
          setSelectedMembershipId(membershipId);

          startTransition(async () => {
            let body: MembershipSwitchResponse;

            try {
              body = await requestJson("/api/session/memberships", {
                body: { membershipId },
                fallbackError: "Could not switch access context.",
                method: "PATCH",
              });
            } catch (caught) {
              toast.error(getCaughtErrorMessage(caught, "Could not switch access context."));
              setSelectedMembershipId(selectedMembership?.membershipId ?? "");
              return;
            }

            const redirectTo = redirectAfterSwitch ?? body.redirectTo;

            if (!redirectTo) {
              toast.error("The selected workspace is not configured.");
              return;
            }

            toast.success("Access context switched.");
            router.push(redirectTo);
            router.refresh();
          });
        }}
      >
        <SelectTrigger
          aria-label="Access context"
          className="h-auto min-h-14 w-full rounded-lg border-stone-600/60 bg-white/5 px-3 py-2 text-left text-stone-100 disabled:cursor-default disabled:opacity-100"
        >
          <SelectValue placeholder="Choose access">
            <span className="flex min-w-0 flex-col items-start gap-0.5">
              <span className="max-w-full truncate text-sm font-semibold">
                {displayedContextName}
              </span>
              {displayedRole ? (
                <span className="text-xs uppercase tracking-[0.14em] text-stone-400">
                  {formatRole(displayedRole)}
                </span>
              ) : null}
            </span>
          </SelectValue>
        </SelectTrigger>
        {canSwitchMembership ? (
          <SelectContent className="min-w-80">
            {uniqueMemberships.map((option) => (
              <SelectItem key={option.membershipId} value={option.membershipId}>
                <span className="flex flex-col items-start gap-0.5">
                  <span>{option.organizationName}</span>
                  <span className="text-xs uppercase tracking-[0.14em] text-stone-500">
                    {formatRole(option.role)}
                  </span>
                </span>
              </SelectItem>
            ))}
          </SelectContent>
        ) : null}
      </Select>
    </div>
  );
}
