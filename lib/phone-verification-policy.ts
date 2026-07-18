export type CustomerPhoneVerificationPolicy = {
  available: boolean;
  required: boolean;
};

export type PhoneVerificationProviderName = "TWILIO_VERIFY";

type PhoneVerificationEnvironment = Readonly<
  Record<string, string | undefined>
>;

function hasValue(value: string | undefined) {
  return Boolean(value?.trim());
}

export function getSelectedPhoneVerificationProvider(
  environment: PhoneVerificationEnvironment = process.env,
): PhoneVerificationProviderName | null {
  return environment.CUSTOMER_PHONE_VERIFICATION_PROVIDER?.trim().toUpperCase() ===
    "TWILIO_VERIFY"
    ? "TWILIO_VERIFY"
    : null;
}

export function getCustomerPhoneVerificationPolicy(
  environment: PhoneVerificationEnvironment = process.env,
): CustomerPhoneVerificationPolicy {
  const provider = getSelectedPhoneVerificationProvider(environment);
  const available =
    provider === "TWILIO_VERIFY" &&
    hasValue(environment.TWILIO_ACCOUNT_SID) &&
    hasValue(environment.TWILIO_AUTH_TOKEN) &&
    hasValue(environment.TWILIO_VERIFY_SERVICE_SID);

  return {
    available,
    required:
      environment.CUSTOMER_PHONE_VERIFICATION_REQUIRED?.trim().toLowerCase() ===
      "true",
  };
}
