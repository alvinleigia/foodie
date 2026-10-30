"use client";

import Link from "next/link";
import { useState } from "react";
import {
  BanIcon,
  CreditCardIcon,
  ExternalLinkIcon,
  GitBranchIcon,
  RefreshCwIcon,
  SaveIcon,
  Settings2Icon,
  XIcon,
} from "lucide-react";
import { toast } from "sonner";

import {
  IntegrationModeSelector,
  IntegrationPanel,
  IntegrationStatus,
} from "@/components/admin/IntegrationPanel";
import { ButtonLabel } from "@/components/shared/ButtonLabel";
import { Button } from "@/components/ui/button";
import { requestJson } from "@/lib/api-client";
import type {
  IntegrationMode,
  OrganizationPaymentSettingsSnapshot,
} from "@/lib/organization-integration-types";

type StripeIntegrationFormProps = {
  apiPath: string;
  backHref: string;
  enabled?: boolean;
  initialSnapshot: OrganizationPaymentSettingsSnapshot;
};

const modeOptions: Array<{
  description: string;
  icon: typeof GitBranchIcon;
  label: string;
  value: IntegrationMode;
}> = [
  {
    description: "Use the connected company account.",
    icon: GitBranchIcon,
    label: "Inherit",
    value: "INHERIT",
  },
  {
    description: "Connect a separate Stripe account.",
    icon: Settings2Icon,
    label: "Custom",
    value: "CUSTOM",
  },
  {
    description: "Turn off online payments for this scope.",
    icon: BanIcon,
    label: "Disabled",
    value: "DISABLED",
  },
];

function EffectiveStatus({ snapshot }: { snapshot: OrganizationPaymentSettingsSnapshot }) {
  if (snapshot.effective.status === "CONFIGURED") {
    return (
      <IntegrationStatus
        tone="success"
        title={`Payments settle through ${snapshot.effective.sourceOrganizationName}`}
        detail={<span className="font-mono text-xs">{snapshot.effective.stripeAccountId}</span>}
      />
    );
  }

  const isDisabled = snapshot.effective.status === "DISABLED";

  return (
    <IntegrationStatus
      tone={isDisabled ? "neutral" : "warning"}
      title={isDisabled ? "Online payment is disabled" : "Stripe needs attention"}
      detail={
        isDisabled
          ? undefined
          : snapshot.effective.reason === "ONBOARDING_INCOMPLETE"
            ? "Complete Stripe onboarding before accepting online payments."
            : snapshot.effective.reason === "INCOMPLETE"
              ? "Connect a Stripe account for the selected custom mode."
              : "No inherited or custom Stripe account is available."
      }
    />
  );
}

export function StripeIntegrationForm({
  apiPath,
  backHref,
  enabled = true,
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
  const resolvedModeOptions = modeOptions.map((option) => ({
    ...option,
    label: option.value === "INHERIT" ? inheritLabel : option.label,
  }));

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
    <IntegrationPanel
      icon={CreditCardIcon}
      title="Stripe payments"
      description="Accept and settle online payments through Stripe."
      status={<EffectiveStatus snapshot={snapshot} />}
    >
      <div className="grid gap-6">
        {!enabled ? (
          <div className="rounded-lg border border-amber-500/35 bg-amber-500/10 px-4 py-3 text-amber-900 dark:text-amber-300">
            <p className="text-sm font-semibold">Stripe payments are not included</p>
            <p className="mt-1 text-sm">
              Enable the Stripe payments feature before connecting or inheriting an account.
            </p>
          </div>
        ) : null}

        <IntegrationModeSelector
          ariaLabel="Payment mode"
          label="Payment mode"
          value={mode}
          options={resolvedModeOptions}
          isOptionDisabled={(option) => !enabled && option.value !== "DISABLED"}
          onChange={(value) => {
            setMode(value);
            setIsDirty(true);
          }}
        />

        {mode === "CUSTOM" ? (
          <div className="grid gap-3 border-l-2 border-border pl-4 text-sm text-muted-foreground">
            <div className="grid gap-1 sm:grid-cols-2 sm:gap-4">
              <span>Connected account</span>
              <span className="font-mono text-xs text-foreground">
                {snapshot.settings.stripeAccountId ?? "Not connected"}
              </span>
            </div>
            <div className="grid gap-1 sm:grid-cols-2 sm:gap-4">
              <span>Onboarding</span>
              <span className="font-semibold text-foreground">
                {snapshot.settings.onboardingStatus.replaceAll("_", " ")}
              </span>
            </div>
            <div className="grid gap-1 sm:grid-cols-2 sm:gap-4">
              <span>Charges</span>
              <span className="font-semibold text-foreground">
                {snapshot.settings.chargesEnabled ? "Enabled" : "Not enabled"}
              </span>
            </div>
            <div className="grid gap-1 sm:grid-cols-2 sm:gap-4">
              <span>Payouts</span>
              <span className="font-semibold text-foreground">
                {snapshot.settings.payoutsEnabled ? "Enabled" : "Not enabled"}
              </span>
            </div>
          </div>
        ) : null}

        <div className="flex flex-wrap gap-3 border-t border-border pt-5">
          <Button
            type="button"
            onClick={() => void save()}
            disabled={
              isSaving ||
              isConnecting ||
              isSyncing ||
              (!enabled && mode !== "DISABLED")
            }
          >
            <ButtonLabel icon={SaveIcon}>
              {isSaving ? "Saving..." : "Save payment mode"}
            </ButtonLabel>
          </Button>
          {mode === "CUSTOM" ? (
            <Button
              type="button"
              variant="outline"
              onClick={() => void connectStripe()}
              disabled={!enabled || isDirty || isSaving || isConnecting || isSyncing}
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
              <ButtonLabel icon={RefreshCwIcon}>
                {isSyncing ? "Refreshing..." : "Refresh status"}
              </ButtonLabel>
            </Button>
          ) : null}
          <Button asChild type="button" variant="ghost">
            <Link href={backHref}>
              <ButtonLabel icon={XIcon}>Back</ButtonLabel>
            </Link>
          </Button>
        </div>
      </div>
    </IntegrationPanel>
  );
}
