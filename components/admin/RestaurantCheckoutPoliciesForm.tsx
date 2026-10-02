"use client";

import { useState } from "react";
import { CreditCardIcon, SaveIcon } from "lucide-react";
import { toast } from "sonner";

import { ButtonLabel } from "@/components/shared/ButtonLabel";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { requestJson } from "@/lib/api-client";
import {
  checkoutContactRequirementLabels,
  checkoutContactRequirements,
  getPayLaterLabel,
  type CheckoutContactRequirement,
  type CheckoutPaymentTiming,
  type RestaurantCheckoutPolicy,
} from "@/lib/checkout-policy";
import { getOrderFulfilmentLabel } from "@/lib/order-fulfilment";

type RestaurantCheckoutPoliciesFormProps = {
  apiPath: string;
  initialPolicies: RestaurantCheckoutPolicy[];
  smsOtpAvailable: boolean;
  stripeConfigured: boolean;
};

function SettingCheckbox({
  checked,
  description,
  disabled,
  label,
  onCheckedChange,
}: {
  checked: boolean;
  description: string;
  disabled?: boolean;
  label: string;
  onCheckedChange: (checked: boolean) => void;
}) {
  return (
    <label className="flex min-h-16 gap-3 rounded-lg border border-stone-200 bg-white p-3">
      <Checkbox
        checked={checked}
        disabled={disabled}
        onCheckedChange={(value) => onCheckedChange(value === true)}
        className="mt-0.5"
      />
      <span>
        <span className="block text-sm font-semibold text-stone-900">{label}</span>
        <span className="mt-1 block text-xs leading-5 text-stone-500">
          {description}
        </span>
      </span>
    </label>
  );
}

export function RestaurantCheckoutPoliciesForm({
  apiPath,
  initialPolicies,
  smsOtpAvailable,
  stripeConfigured,
}: RestaurantCheckoutPoliciesFormProps) {
  const [policies, setPolicies] = useState(initialPolicies);
  const [isSaving, setIsSaving] = useState(false);

  function updatePolicy(
    fulfilmentType: RestaurantCheckoutPolicy["fulfilmentType"],
    update: (policy: RestaurantCheckoutPolicy) => RestaurantCheckoutPolicy,
  ) {
    setPolicies((current) =>
      current.map((policy) =>
        policy.fulfilmentType === fulfilmentType ? update(policy) : policy,
      ),
    );
  }

  async function save() {
    setIsSaving(true);

    try {
      const response = await requestJson<{ policies: RestaurantCheckoutPolicy[] }>(
        apiPath,
        { body: { policies }, method: "PATCH" },
      );
      setPolicies(response.policies);
      toast.success("Checkout policies updated.");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Checkout policies could not be saved.",
      );
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <Card className="rounded-xl border-stone-200 bg-white">
      <CardHeader className="px-5 pt-5">
        <div className="flex items-start gap-3">
          <CreditCardIcon className="mt-1 size-5 text-amber-700" />
          <div>
            <h3 className="text-2xl font-semibold text-stone-950">
              Checkout and payments
            </h3>
            <p className="mt-1 text-sm text-stone-500">
              Control checkout access, contact details and payment timing for each fulfilment type.
            </p>
          </div>
        </div>
      </CardHeader>
      <CardContent className="grid gap-5 px-5 pb-5">
        {!stripeConfigured ? (
          <p className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
            Configure Stripe before accepting guest or online checkout.
          </p>
        ) : null}
        {!smsOtpAvailable ? (
          <p className="rounded-lg border border-stone-200 bg-stone-50 p-3 text-sm text-stone-600">
            Mobile OTP login becomes available when the Twilio Verify integration is configured.
          </p>
        ) : null}

        {policies.map((policy) => {
          const payLaterLabel = getPayLaterLabel(policy.fulfilmentType);

          return (
            <fieldset
              key={policy.fulfilmentType}
              className="grid gap-4 border-t border-stone-200 pt-5 first:border-t-0 first:pt-0"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <legend className="text-lg font-semibold text-stone-950">
                    {getOrderFulfilmentLabel(policy.fulfilmentType)}
                  </legend>
                  <p className="mt-1 text-sm text-stone-500">
                    Guest orders always require successful online payment.
                  </p>
                </div>
                <SettingCheckbox
                  checked={policy.isEnabled}
                  description="Show this option during checkout."
                  label="Enabled"
                  onCheckedChange={(isEnabled) =>
                    updatePolicy(policy.fulfilmentType, (current) => ({
                      ...current,
                      isEnabled,
                    }))
                  }
                />
              </div>

              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                <SettingCheckbox
                  checked={policy.guestCheckoutEnabled}
                  description="No account is created; online payment is compulsory."
                  label="Guest checkout"
                  onCheckedChange={(guestCheckoutEnabled) =>
                    updatePolicy(policy.fulfilmentType, (current) => ({
                      ...current,
                      guestCheckoutEnabled,
                      onlinePaymentEnabled: guestCheckoutEnabled
                        ? true
                        : current.onlinePaymentEnabled,
                      accountCheckoutEnabled: guestCheckoutEnabled
                        ? current.accountCheckoutEnabled
                        : true,
                    }))
                  }
                />
                <SettingCheckbox
                  checked={policy.accountCheckoutEnabled}
                  description="Customers sign in for history and pay-later options."
                  label="Account checkout"
                  onCheckedChange={(accountCheckoutEnabled) =>
                    updatePolicy(policy.fulfilmentType, (current) => ({
                      ...current,
                      accountCheckoutEnabled,
                      guestCheckoutEnabled: accountCheckoutEnabled
                        ? current.guestCheckoutEnabled
                        : true,
                      onlinePaymentEnabled: accountCheckoutEnabled
                        ? current.onlinePaymentEnabled
                        : true,
                    }))
                  }
                />
                <SettingCheckbox
                  checked={policy.emailOtpLoginEnabled}
                  description="Allow customers to sign in using an emailed code."
                  label="Email OTP login"
                  onCheckedChange={(emailOtpLoginEnabled) =>
                    updatePolicy(policy.fulfilmentType, (current) => ({
                      ...current,
                      emailOtpLoginEnabled,
                    }))
                  }
                />
                <SettingCheckbox
                  checked={policy.smsOtpLoginEnabled}
                  description="Allow customers to sign in using a mobile code."
                  label="Mobile OTP login"
                  onCheckedChange={(smsOtpLoginEnabled) =>
                    updatePolicy(policy.fulfilmentType, (current) => ({
                      ...current,
                      smsOtpLoginEnabled,
                    }))
                  }
                />
              </div>

              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                <SettingCheckbox
                  checked={policy.onlinePaymentEnabled}
                  disabled={policy.guestCheckoutEnabled}
                  description={
                    policy.guestCheckoutEnabled
                      ? "Required because guest checkout is enabled."
                      : "Let signed-in customers pay during checkout."
                  }
                  label="Online payment"
                  onCheckedChange={(onlinePaymentEnabled) =>
                    updatePolicy(policy.fulfilmentType, (current) => ({
                      ...current,
                      onlinePaymentEnabled,
                      payLaterEnabled: onlinePaymentEnabled
                        ? current.payLaterEnabled
                        : true,
                      defaultPaymentTiming:
                        !onlinePaymentEnabled && current.defaultPaymentTiming === "ONLINE"
                          ? "PAY_LATER"
                          : current.defaultPaymentTiming,
                    }))
                  }
                />
                <SettingCheckbox
                  checked={policy.payLaterEnabled}
                  description={`Offer “${payLaterLabel}” to signed-in customers.`}
                  label={payLaterLabel}
                  onCheckedChange={(payLaterEnabled) =>
                    updatePolicy(policy.fulfilmentType, (current) => ({
                      ...current,
                      payLaterEnabled,
                      onlinePaymentEnabled: payLaterEnabled
                        ? current.onlinePaymentEnabled
                        : true,
                      defaultPaymentTiming:
                        !payLaterEnabled && current.defaultPaymentTiming === "PAY_LATER"
                          ? "ONLINE"
                          : current.defaultPaymentTiming,
                    }))
                  }
                />
                <label className="grid content-start gap-2 text-sm font-medium text-stone-800">
                  Contact details
                  <Select
                    value={policy.contactRequirement}
                    onValueChange={(contactRequirement) =>
                      updatePolicy(policy.fulfilmentType, (current) => ({
                        ...current,
                        contactRequirement:
                          contactRequirement as CheckoutContactRequirement,
                      }))
                    }
                  >
                    <SelectTrigger className="bg-white">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {checkoutContactRequirements.map((requirement) => (
                        <SelectItem key={requirement} value={requirement}>
                          {checkoutContactRequirementLabels[requirement]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </label>
                <label className="grid content-start gap-2 text-sm font-medium text-stone-800">
                  Default for signed-in customers
                  <Select
                    value={policy.defaultPaymentTiming}
                    onValueChange={(defaultPaymentTiming) =>
                      updatePolicy(policy.fulfilmentType, (current) => ({
                        ...current,
                        defaultPaymentTiming:
                          defaultPaymentTiming as CheckoutPaymentTiming,
                      }))
                    }
                  >
                    <SelectTrigger className="bg-white">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {policy.onlinePaymentEnabled ? (
                        <SelectItem value="ONLINE">Pay online</SelectItem>
                      ) : null}
                      {policy.payLaterEnabled ? (
                        <SelectItem value="PAY_LATER">{payLaterLabel}</SelectItem>
                      ) : null}
                    </SelectContent>
                  </Select>
                </label>
              </div>
            </fieldset>
          );
        })}

        <Button
          type="button"
          onClick={() => void save()}
          disabled={isSaving}
          className="w-fit"
        >
          <ButtonLabel icon={SaveIcon}>
            {isSaving ? "Saving..." : "Save checkout policies"}
          </ButtonLabel>
        </Button>
      </CardContent>
    </Card>
  );
}
