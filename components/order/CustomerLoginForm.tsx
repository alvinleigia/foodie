"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { signIn } from "next-auth/react";
import { KeyRoundIcon, LogInIcon, MailIcon } from "lucide-react";
import { toast } from "sonner";

import { ButtonLabel } from "@/components/shared/ButtonLabel";
import { FormField } from "@/components/shared/FormField";
import { Spinner } from "@/components/shared/Spinner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { getCaughtErrorMessage, requestJson } from "@/lib/api-client";
import { withPublicCustomerContext } from "@/lib/customer-navigation";
import { cn } from "@/lib/utils";

export type CustomerAuthProviders = {
  apple: boolean;
  email: boolean;
  facebook: boolean;
  google: boolean;
};

type CustomerLoginFormProps = {
  className?: string;
  description?: string;
  locationQrSlug?: string;
  locationSlug?: string;
  onSignedIn?: () => void;
  providers: CustomerAuthProviders;
  redirectTo?: string;
  title?: string;
};

export function CustomerLoginForm({
  className,
  description = "Your orders will be saved to your account for easy tracking and reordering.",
  locationQrSlug,
  locationSlug,
  onSignedIn,
  providers,
  redirectTo,
  title = "Sign in to continue",
}: CustomerLoginFormProps) {
  const router = useRouter();
  const [startingProvider, setStartingProvider] = useState<
    "apple" | "facebook" | "google" | null
  >(null);
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [step, setStep] = useState<"email" | "code">("email");
  const [retrySeconds, setRetrySeconds] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [isRequestingCode, setIsRequestingCode] = useState(false);
  const [isVerifyingCode, setIsVerifyingCode] = useState(false);
  const hasSocialProvider = providers.google || providers.apple || providers.facebook;

  useEffect(() => {
    if (retrySeconds <= 0) {
      return;
    }

    const timer = window.setTimeout(() => {
      setRetrySeconds((seconds) => Math.max(0, seconds - 1));
    }, 1_000);

    return () => window.clearTimeout(timer);
  }, [retrySeconds]);

  function getRedirectTarget() {
    return redirectTo ?? window.location.href;
  }

  async function startSocialLogin(
    provider: "apple" | "facebook" | "google",
    providerLabel: string,
  ) {
    setStartingProvider(provider);
    setError(null);

    try {
      await requestJson(
        withPublicCustomerContext("/api/customer/auth/oauth-context", {
          locationQrSlug,
          locationSlug,
        }),
        {
          body: { provider },
          fallbackError: `${providerLabel} sign-in is temporarily unavailable.`,
        },
      );
      await signIn(provider, { redirectTo: getRedirectTarget() });
    } catch (loginError) {
      setError(
        getCaughtErrorMessage(
          loginError,
          `${providerLabel} sign-in could not be started. Please try again.`,
        ),
      );
      setStartingProvider(null);
    }
  }

  async function requestCode() {
    const normalizedEmail = email.trim().toLowerCase();

    if (!/^\S+@\S+\.\S+$/.test(normalizedEmail)) {
      setError("Enter a valid email address.");
      return;
    }

    setIsRequestingCode(true);
    setError(null);

    try {
      await requestJson(
        withPublicCustomerContext("/api/customer/auth/request-code", {
          locationQrSlug,
          locationSlug,
        }),
        {
          body: { email: normalizedEmail },
          fallbackError: "The sign-in code could not be sent.",
        },
      );
      setEmail(normalizedEmail);
      setCode("");
      setStep("code");
      setRetrySeconds(60);
      toast.success("Sign-in code sent.");
    } catch (requestError) {
      setError(
        getCaughtErrorMessage(requestError, "The sign-in code could not be sent."),
      );
    } finally {
      setIsRequestingCode(false);
    }
  }

  async function verifyCode() {
    if (!/^\d{6}$/.test(code.trim())) {
      setError("Enter the six-digit code.");
      return;
    }

    setIsVerifyingCode(true);
    setError(null);

    try {
      const result = await signIn("customer-email-otp", {
        code: code.trim(),
        email,
        redirect: false,
        redirectTo: getRedirectTarget(),
      });

      if (!result.ok) {
        setError("The code is invalid or has expired. Request a new code and try again.");
        return;
      }

      toast.success("Signed in successfully.");

      if (onSignedIn) {
        onSignedIn();
      } else {
        router.replace(getRedirectTarget());
        router.refresh();
      }
    } catch {
      setError("The code could not be verified. Please try again.");
    } finally {
      setIsVerifyingCode(false);
    }
  }

  return (
    <div className={cn("grid gap-4", className)}>
      <div>
        <p className="font-semibold text-stone-950">{title}</p>
        <p className="mt-1 text-sm text-stone-600">{description}</p>
      </div>

      {providers.email ? (
        step === "email" ? (
          <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
            <FormField label="Email address" htmlFor="customer-login-email">
              <Input
                id="customer-login-email"
                type="email"
                value={email}
                onChange={(event) => {
                  setEmail(event.target.value);
                  setError(null);
                }}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    void requestCode();
                  }
                }}
                placeholder="you@example.com"
                autoComplete="email"
                disabled={isRequestingCode}
                className="h-11 bg-white"
              />
            </FormField>
            <Button
              type="button"
              onClick={requestCode}
              disabled={isRequestingCode}
              className="min-h-11 px-4"
            >
              {isRequestingCode ? (
                <span className="inline-flex items-center gap-2">
                  <Spinner className="text-white" />
                  Sending...
                </span>
              ) : (
                <ButtonLabel icon={MailIcon}>Email me a code</ButtonLabel>
              )}
            </Button>
          </div>
        ) : (
          <div className="grid gap-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm text-stone-600">
                Enter the code sent to <span className="font-medium text-stone-900">{email}</span>.
              </p>
              <Button
                type="button"
                variant="link"
                onClick={() => {
                  setStep("email");
                  setCode("");
                  setError(null);
                }}
                className="h-auto p-0 text-stone-700"
              >
                Change email
              </Button>
            </div>
            <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
              <FormField label="Six-digit code" htmlFor="customer-login-code">
                <Input
                  id="customer-login-code"
                  value={code}
                  onChange={(event) => {
                    setCode(event.target.value.replace(/\D/g, "").slice(0, 6));
                    setError(null);
                  }}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      void verifyCode();
                    }
                  }}
                  inputMode="numeric"
                  pattern="[0-9]*"
                  maxLength={6}
                  autoComplete="one-time-code"
                  disabled={isVerifyingCode}
                  className="h-11 bg-white text-base"
                />
              </FormField>
              <Button
                type="button"
                onClick={verifyCode}
                disabled={isVerifyingCode}
                className="min-h-11 px-4"
              >
                {isVerifyingCode ? (
                  <span className="inline-flex items-center gap-2">
                    <Spinner className="text-white" />
                    Verifying...
                  </span>
                ) : (
                  <ButtonLabel icon={KeyRoundIcon}>Verify code</ButtonLabel>
                )}
              </Button>
            </div>
            <Button
              type="button"
              variant="link"
              onClick={requestCode}
              disabled={isRequestingCode || retrySeconds > 0}
              className="h-auto w-fit p-0 text-stone-700"
            >
              {retrySeconds > 0 ? `Resend code in ${retrySeconds}s` : "Resend code"}
            </Button>
          </div>
        )
      ) : null}

      {hasSocialProvider && providers.email ? (
        <div className="flex items-center gap-3 text-xs font-medium uppercase text-stone-400">
          <span className="h-px flex-1 bg-stone-200" />
          Or
          <span className="h-px flex-1 bg-stone-200" />
        </div>
      ) : null}

      {hasSocialProvider ? (
        <div className="grid gap-2 sm:grid-flow-col sm:auto-cols-fr">
          {providers.google ? (
            <Button
              type="button"
              variant="outline"
              onClick={() => startSocialLogin("google", "Google")}
              disabled={startingProvider !== null}
              className="min-h-11 rounded-lg border-stone-300 bg-white px-4"
            >
              {startingProvider === "google" ? (
                <Spinner />
              ) : (
                <ButtonLabel icon={LogInIcon}>Google</ButtonLabel>
              )}
            </Button>
          ) : null}
          {providers.apple ? (
            <Button
              type="button"
              onClick={() => startSocialLogin("apple", "Apple")}
              disabled={startingProvider !== null}
              className="min-h-11 rounded-lg bg-stone-950 px-4 text-white hover:bg-stone-800"
            >
              {startingProvider === "apple" ? (
                <Spinner className="text-white" />
              ) : (
                <ButtonLabel icon={LogInIcon}>Apple</ButtonLabel>
              )}
            </Button>
          ) : null}
          {providers.facebook ? (
            <Button
              type="button"
              onClick={() => startSocialLogin("facebook", "Facebook")}
              disabled={startingProvider !== null}
              className="min-h-11 rounded-lg bg-[#1877f2] px-4 text-white hover:bg-[#166ad8]"
            >
              {startingProvider === "facebook" ? (
                <Spinner className="text-white" />
              ) : (
                <ButtonLabel icon={LogInIcon}>Facebook</ButtonLabel>
              )}
            </Button>
          ) : null}
        </div>
      ) : !providers.email ? (
        <p className="text-sm font-medium text-amber-700">
          Customer login is temporarily unavailable.
        </p>
      ) : null}

      {error ? (
        <p role="alert" className="text-sm text-rose-600">
          {error}
        </p>
      ) : null}
    </div>
  );
}
