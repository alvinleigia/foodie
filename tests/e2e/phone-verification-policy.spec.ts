import { expect, test } from "@playwright/test";

import { getCustomerPhoneVerificationPolicy } from "../../lib/phone-verification-policy";

test.describe("customer phone verification policy", () => {
  test("is disabled and optional by default", () => {
    expect(getCustomerPhoneVerificationPolicy({})).toEqual({
      available: false,
      required: false,
    });
  });

  test("does not report Twilio as available with incomplete credentials", () => {
    expect(
      getCustomerPhoneVerificationPolicy({
        CUSTOMER_PHONE_VERIFICATION_PROVIDER: "TWILIO_VERIFY",
        TWILIO_ACCOUNT_SID: "AC_test",
      }),
    ).toEqual({
      available: false,
      required: false,
    });
  });

  test("reports a complete Twilio configuration as available", () => {
    expect(
      getCustomerPhoneVerificationPolicy({
        CUSTOMER_PHONE_VERIFICATION_PROVIDER: "twilio_verify",
        CUSTOMER_PHONE_VERIFICATION_REQUIRED: "true",
        TWILIO_ACCOUNT_SID: "AC_test",
        TWILIO_AUTH_TOKEN: "secret",
        TWILIO_VERIFY_SERVICE_SID: "VA_test",
      }),
    ).toEqual({
      available: true,
      required: true,
    });
  });
});
