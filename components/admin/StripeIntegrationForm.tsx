"use client";

import Link from "next/link";
import { useState } from "react";
import {
  BanIcon,
  CheckCircle2Icon,
  CreditCardIcon,
  ExternalLinkIcon,
  GitBranchIcon,
  RefreshCwIcon,
  SaveIcon,
  Settings2Icon,
  XIcon,
} from "lucide-react";
import { toast } from "sonner";

import { ButtonLabel } from "@/components/shared/ButtonLabel";
import { Button } from "@/components/ui/button";
import { requestJson } from "@/lib/api-client";
import type {
  IntegrationMode,
  OrganizationPaymentSettingsSnapshot,
} from "@/lib/organization-integration-types";
import { cn } from "@/lib/utils";

type StripeIntegrationFormProps = {
  apiPath: string;
  backHref: string;
  initialSnapshot: OrganizationPaymentSettingsSnapshot;
};

const modeOptions: Array<{
  icon: typeof GitBranchIcon;
  label: string;
  value: IntegrationMode;
}> = [
  { icon: GitBranchIcon, label: "Inherit", value: "INHERIT" },
  { icon: Settings2Icon, label: "Custom", value: "CUSTOM" },
  { icon: BanIcon, label: "Disabled", value: "DISABLED" },
];

function EffectiveStatus({ snapshot }: { snapshot: OrganizationPaymentSettingsSnapshot }) {
  if (snapshot.effective.status === "CONFIGURED") {
    return (
      <div className="flex items-start gap-3 border-l-4 border-emerald-500 bg-emerald-50 px-4 py-3">
        <CheckCircle2Icon className="mt-0.5 size-5 shrink-0 text-emerald-700" />
        <div className="min-w-0">
          <p className="text-sm font-semibold text-emerald-950">
            Payments settle through {snapshot.effective.sourceOrganizationName}
          </p>
          <p className="mt-1 break-words font-mono text-xs text-emerald-800">
            {snapshot.effective.stripeAccountId}
          </p>
        </div>
      </div>
    );
  }

  const isDisabled = snapshot.effective.status === "DISABLED";

  return (
    <div
      className={cn(
        "border-l-4 px-4 py-3",
        isDisabled
          ? "border-stone-400 bg-stone-100 text-stone-700"
          : "border-amber-500 bg-amber-50 text-amber-900",
      )}
    >
      <p className="text-sm font-semibold">
        {isDisabled ? "Online payment is disabled" : "Stripe needs attention"}
      </p>
      {!isDisabled ? (
        <p className="mt-1 text-sm">
          {snapshot.effective.reason === "ONBOARDING_INCOMPLETE"
            ? "Complete Stripe onboarding before accepting online payments."
            : snapshot.effective.reason === "INCOMPLETE"
              ? "Connect a Stripe account for the selected custom mode."
              : "No inherited or custom Stripe account is available."}
        </p>
      ) : null}
    </div>
  );
}

export function StripeIntegrationForm({
  apiPath,
  backHref,
  initialSnapshot,
}: StripeIntegrationFormProps) {
  const [snapshot, setSnapshot] = useState(initialSnapshot);
  const [mode, setMode] = useState(initialSnapshot.settings.mode);
  const [isDirty, setIsDirty] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const inheritLabel =
    snapshot.parent?.type === "COMPANY"
      ? `Inherit from ${snapshot.parent.name}`
      : "No connected account";

  async function save() {
    setIsSaving(true);

    try {
      const payload = await requestJson<{ snapshot: OrganizationPaymentSettingsSnapshot }>(
        apiPath,
        {
          method: "PATCH",
          body: { mode },
          fallbackError: "Payment settings could not be saved.",
        },
      );
      setSnapshot(payload.snapshot);
      setMode(payload.snapshot.settings.mode);
      setIsDirty(false);
      toast.success("Payment settings saved.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Payment settings could not be saved.");
    } finally {
      setIsSaving(false);
    }
  }

  async function connectStripe() {
    setIsConnecting(true);

    try {
      const payload = await requestJson<{ onboardingUrl: string }>(apiPath, {
        method: "POST",
        body: { action: "ONBOARD" },
        fallbackError: "Stripe onboarding could not be started.",
      });
      window.location.assign(payload.onboardingUrl);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Stripe onboarding could not be started.");
      setIsConnecting(false);
    }
  }

  async function syncStripe() {
    setIsSyncing(true);

    try {
      const payload = await requestJson<{ snapshot: OrganizationPaymentSettingsSnapshot }>(
        apiPath,
        {
          method: "POST",
          body: { action: "SYNC" },
          fallbackError: "Stripe status could not be refreshed.",
        },
      );
      setSnapshot(payload.snapshot);
      setMode(payload.snapshot.settings.mode);
      setIsDirty(false);
      toast.success("Stripe status refreshed.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Stripe status could not be refreshed.");
    } finally {
      setIsSyncing(false);
    }
  }

  return (
    <div className="grid gap-6 border-t border-stone-200 pt-8">
      <div className="flex items-center gap-2">
        <CreditCardIcon className="size-5 text-stone-700" />
        <h2 className="text-xl font-semibold text-stone-950">Stripe payments</h2>
      </div>
      <EffectiveStatus snapshot={snapshot} />

      <fieldset className="grid gap-3">
        <legend className="text-sm font-semibold text-stone-900">Payment mode</legend>
        <div className="grid gap-2 sm:grid-cols-3" role="radiogroup" aria-label="Payment mode">
          {modeOptions.map((option) => {
            const Icon = option.icon;
            const isSelected = mode === option.value;

            return (
              <button
                key={option.value}
                type="button"
                role="radio"
                aria-checked={isSelected}
                onClick={() => {
                  setMode(option.value);
                  setIsDirty(true);
                }}
                className={cn(
                  "flex min-h-12 items-center justify-center gap-2 rounded-md border px-3 text-sm font-semibold transition-colors",
                  isSelected
                    ? "border-stone-950 bg-stone-950 text-white"
                    : "border-stone-200 bg-white text-stone-700 hover:border-stone-400",
                )}
              >
                <Icon className="size-4" />
                {option.value === "INHERIT" ? inheritLabel : option.label}
              </button>
            );
          })}
        </div>
      </fieldset>

      {mode === "CUSTOM" ? (
        <div className="grid gap-3 border-l-2 border-stone-200 pl-4 text-sm text-stone-700">
          <div className="grid gap-1 sm:grid-cols-2 sm:gap-4">
            <span>Connected account</span>
            <span className="font-mono text-xs text-stone-950">
              {snapshot.settings.stripeAccountId ?? "Not connected"}
            </span>
          </div>
          <div className="grid gap-1 sm:grid-cols-2 sm:gap-4">
            <span>Onboarding</span>
            <span className="font-semibold text-stone-950">
              {snapshot.settings.onboardingStatus.replaceAll("_", " ")}
            </span>
          </div>
          <div className="grid gap-1 sm:grid-cols-2 sm:gap-4">
            <span>Charges</span>
            <span className="font-semibold text-stone-950">
              {snapshot.settings.chargesEnabled ? "Enabled" : "Not enabled"}
            </span>
          </div>
          <div className="grid gap-1 sm:grid-cols-2 sm:gap-4">
            <span>Payouts</span>
            <span className="font-semibold text-stone-950">
              {snapshot.settings.payoutsEnabled ? "Enabled" : "Not enabled"}
            </span>
          </div>
        </div>
      ) : null}

      <div className="flex flex-wrap gap-3 border-t border-stone-200 pt-5">
        <Button type="button" onClick={() => void save()} disabled={isSaving || isConnecting || isSyncing}>
          <ButtonLabel icon={SaveIcon}>{isSaving ? "Saving..." : "Save payment mode"}</ButtonLabel>
        </Button>
        {mode === "CUSTOM" ? (
          <Button
            type="button"
            variant="outline"
            onClick={() => void connectStripe()}
            disabled={isDirty || isSaving || isConnecting || isSyncing}
          >
            <ButtonLabel icon={ExternalLinkIcon}>
              {isConnecting
                ? "Opening Stripe..."
                : snapshot.settings.stripeAccountId
                  ? snapshot.settings.onboardingStatus === "COMPLETE"
                    ? "Manage Stripe details"
                    : "Continue Stripe onboarding"
                  : "Connect Stripe"}
            </ButtonLabel>
          </Button>
        ) : null}
        {mode === "CUSTOM" && snapshot.settings.stripeAccountId ? (
          <Button
            type="button"
            variant="outline"
            onClick={() => void syncStripe()}
            disabled={isDirty || isSaving || isConnecting || isSyncing}
          >
            <ButtonLabel icon={RefreshCwIcon}>{isSyncing ? "Refreshing..." : "Refresh status"}</ButtonLabel>
          </Button>
        ) : null}
        <Button asChild type="button" variant="ghost">
          <Link href={backHref}>
            <ButtonLabel icon={XIcon}>Back</ButtonLabel>
          </Link>
        </Button>
      </div>
    </div>
  );
}
