import "server-only";

import {
  getCustomerPhoneVerificationPolicy,
  getSelectedPhoneVerificationProvider,
  type PhoneVerificationProviderName,
} from "@/lib/phone-verification-policy";

export type PhoneVerificationProvider = {
  name: PhoneVerificationProviderName;
  check(phone: string, code: string): Promise<boolean>;
  start(phone: string): Promise<void>;
};

export type PhoneVerificationProviderErrorKind =
  | "RATE_LIMITED"
  | "REJECTED"
  | "UNAVAILABLE";

export class PhoneVerificationProviderError extends Error {
  constructor(public readonly kind: PhoneVerificationProviderErrorKind) {
    super(`Phone verification provider error: ${kind}`);
    this.name = "PhoneVerificationProviderError";
  }
}

type TwilioVerifyResponse = {
  status?: string;
};

function getTwilioCredentials() {
  const accountSid = process.env.TWILIO_ACCOUNT_SID?.trim();
  const authToken = process.env.TWILIO_AUTH_TOKEN?.trim();
  const serviceSid = process.env.TWILIO_VERIFY_SERVICE_SID?.trim();

  if (!accountSid || !authToken || !serviceSid) {
    throw new PhoneVerificationProviderError("UNAVAILABLE");
  }

  return { accountSid, authToken, serviceSid };
}

async function requestTwilioVerify(
  endpoint: "VerificationCheck" | "Verifications",
  values: Record<string, string>,
) {
  const { accountSid, authToken, serviceSid } = getTwilioCredentials();
  let response: Response;

  try {
    response = await fetch(
      `https://verify.twilio.com/v2/Services/${encodeURIComponent(serviceSid)}/${endpoint}`,
      {
        method: "POST",
        headers: {
          Authorization: `Basic ${Buffer.from(`${accountSid}:${authToken}`).toString("base64")}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams(values),
        signal: AbortSignal.timeout(10_000),
      },
    );
  } catch {
    throw new PhoneVerificationProviderError("UNAVAILABLE");
  }

  if (response.status === 429) {
    throw new PhoneVerificationProviderError("RATE_LIMITED");
  }

  if (!response.ok) {
    throw new PhoneVerificationProviderError(
      response.status >= 400 && response.status < 500
        ? "REJECTED"
        : "UNAVAILABLE",
    );
  }

  try {
    return (await response.json()) as TwilioVerifyResponse;
  } catch {
    throw new PhoneVerificationProviderError("UNAVAILABLE");
  }
}

const twilioVerifyProvider: PhoneVerificationProvider = {
  name: "TWILIO_VERIFY",
  async start(phone) {
    await requestTwilioVerify("Verifications", {
      Channel: "sms",
      To: phone,
    });
  },
  async check(phone, code) {
    try {
      const response = await requestTwilioVerify("VerificationCheck", {
        Code: code,
        To: phone,
      });

      return response.status === "approved";
    } catch (error) {
      if (
        error instanceof PhoneVerificationProviderError &&
        error.kind === "REJECTED"
      ) {
        return false;
      }

      throw error;
    }
  },
};

export function getPhoneVerificationProvider() {
  if (!getCustomerPhoneVerificationPolicy().available) {
    return null;
  }

  switch (getSelectedPhoneVerificationProvider()) {
    case "TWILIO_VERIFY":
      return twilioVerifyProvider;
    default:
      return null;
  }
}
