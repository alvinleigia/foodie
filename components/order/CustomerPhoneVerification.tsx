"use client";

import { useState } from "react";
import { CheckCircle2Icon, MessageSquareTextIcon } from "lucide-react";
import { toast } from "sonner";

import { ButtonLabel } from "@/components/shared/ButtonLabel";
import { Spinner } from "@/components/shared/Spinner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  getCaughtErrorMessage,
  requestJson,
} from "@/lib/api-client";
import { withPublicCustomerContext } from "@/lib/customer-navigation";
import type { CustomerPhoneVerificationPolicy } from "@/lib/phone-verification-policy";
import {
  isValidCustomerPhone,
  normalizeCustomerPhone,
} from "@/lib/validations/customer";
import { cn } from "@/lib/utils";

type CustomerPhoneVerificationProps = {
  className?: string;
  disabled?: boolean;
  onVerified: (verifiedAt: string) => void;
  orderingPointQrSlug?: string;
  phone: string;
  phoneVerifiedAt: string | null;
  policy: CustomerPhoneVerificationPolicy;
  routeSlug?: string;
  savedPhone: string | null;
};

type VerificationResponse = {
  status: "pending" | "verified";
  verifiedAt?: string;
};

export function CustomerPhoneVerification({
  className,
  disabled = false,
  onVerified,
  orderingPointQrSlug,
  phone,
  phoneVerifiedAt,
  policy,
  routeSlug,
  savedPhone,
}: CustomerPhoneVerificationProps) {
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [hasSentCode, setHasSentCode] = useState(false);
  const [isChecking, setIsChecking] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const normalizedPhone = isValidCustomerPhone(phone)
    ? normalizeCustomerPhone(phone)
    : null;
  const normalizedSavedPhone = isValidCustomerPhone(savedPhone)
    ? normalizeCustomerPhone(savedPhone!)
    : null;
  const isSavedPhone = Boolean(
    normalizedPhone && normalizedPhone === normalizedSavedPhone,
  );
  const isVerified = Boolean(isSavedPhone && phoneVerifiedAt);
  const customerContext = { orderingPointQrSlug, routeSlug };

  if (!policy.available && !policy.required) {
    return null;
  }

  if (isVerified) {
    return (
      <div
        className={cn(
          "flex items-center gap-2 border-t border-emerald-200 pt-4 text-sm font-medium text-emerald-900",
          className,
        )}
      >
        <CheckCircle2Icon className="size-4" />
        Phone number verified
      </div>
    );
  }

  if (!policy.available) {
    return (
      <div
        className={cn(
          "border-t border-amber-200 pt-4 text-sm text-amber-900",
          className,
        )}
      >
        Phone verification is required but temporarily unavailable. Please contact the
        restaurant before ordering.
      </div>
    );
  }

  async function sendCode() {
    if (!isSavedPhone) {
      setError("Save this phone number before requesting a code.");
      return;
    }

    setIsSending(true);
    setError(null);

    try {
      const response = await requestJson<VerificationResponse>(
        withPublicCustomerContext(
          "/api/customer/phone-verification/start",
          customerContext,
        ),
        { fallbackError: "The verification code could not be sent." },
      );

      if (response.status === "verified" && response.verifiedAt) {
        onVerified(response.verifiedAt);
        return;
      }

      setHasSentCode(true);
      toast.success("Verification code sent.");
    } catch (requestError) {
      setError(
        getCaughtErrorMessage(
          requestError,
          "The verification code could not be sent.",
        ),
      );
    } finally {
      setIsSending(false);
    }
  }

  async function checkCode() {
    if (!/^\d{4,10}$/.test(code.trim())) {
      setError("Enter the verification code.");
      return;
    }

    setIsChecking(true);
    setError(null);

    try {
      const response = await requestJson<VerificationResponse>(
        withPublicCustomerContext(
          "/api/customer/phone-verification/check",
          customerContext,
        ),
        {
          body: { code: code.trim() },
          fallbackError: "The verification code could not be checked.",
        },
      );

      if (response.status !== "verified" || !response.verifiedAt) {
        throw new Error("The verification code could not be confirmed.");
      }

      onVerified(response.verifiedAt);
      setCode("");
      setHasSentCode(false);
      toast.success("Phone number verified.");
    } catch (requestError) {
      setError(
        getCaughtErrorMessage(
          requestError,
          "The verification code could not be checked.",
        ),
      );
    } finally {
      setIsChecking(false);
    }
  }

  return (
    <div className={cn("grid gap-3 border-t border-stone-200 pt-4", className)}>
      <div>
        <p className="text-sm font-semibold text-stone-900">
          {policy.required ? "Verify your phone number" : "Phone verification"}
        </p>
        <p className="mt-1 text-sm text-stone-600">
          {!isSavedPhone
            ? "Save this phone number before requesting a code."
            : "We will send a one-time code by text message."}
        </p>
      </div>

      {hasSentCode ? (
        <div className="flex flex-col gap-2 sm:flex-row sm:items-start">
          <Input
            value={code}
            onChange={(event) => {
              setCode(event.target.value.replace(/\D/g, "").slice(0, 10));
              setError(null);
            }}
            aria-label="Phone verification code"
            autoComplete="one-time-code"
            inputMode="numeric"
            placeholder="Verification code"
            disabled={disabled || isChecking || isSending}
            className="h-11 bg-white sm:max-w-56"
          />
          <Button
            type="button"
            onClick={checkCode}
            disabled={disabled || isChecking || isSending || !code.trim()}
            className="min-h-11"
          >
            {isChecking ? (
              <span className="inline-flex items-center gap-2">
                <Spinner className="text-white" />
                Checking...
              </span>
            ) : (
              <ButtonLabel icon={CheckCircle2Icon}>Verify code</ButtonLabel>
            )}
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={sendCode}
            disabled={disabled || isChecking || isSending}
            className="min-h-11"
          >
            {isSending ? "Sending..." : "Resend code"}
          </Button>
        </div>
      ) : (
        <Button
          type="button"
          variant="outline"
          onClick={sendCode}
          disabled={disabled || isSending || !isSavedPhone}
          className="min-h-11 w-fit"
        >
          {isSending ? (
            <span className="inline-flex items-center gap-2">
              <Spinner />
              Sending...
            </span>
          ) : (
            <ButtonLabel icon={MessageSquareTextIcon}>Send code</ButtonLabel>
          )}
        </Button>
      )}

      {error ? <p className="text-sm text-rose-600">{error}</p> : null}
    </div>
  );
}
