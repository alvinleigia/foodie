# Customer Phone Verification

Phone verification is provider-neutral in the application. Twilio Verify is the
first adapter, but customer profiles only store a verification timestamp. They do
not store a Twilio-specific identifier.

## Current UAT Setting

Keep verification disabled until an SMS provider and budget are ready:

```env
CUSTOMER_PHONE_VERIFICATION_PROVIDER="disabled"
CUSTOMER_PHONE_VERIFICATION_REQUIRED="false"
TWILIO_ACCOUNT_SID=""
TWILIO_AUTH_TOKEN=""
TWILIO_VERIFY_SERVICE_SID=""
```

With these values, the existing phone field remains mandatory for customer orders,
but no SMS is sent and no verification cost is incurred.

## Enable Twilio Later

1. Create a Twilio account and a Verify Service.
2. Add the account SID, auth token and Verify Service SID to the Vercel project.
3. First enable optional verification in staging:

```env
CUSTOMER_PHONE_VERIFICATION_PROVIDER="TWILIO_VERIFY"
CUSTOMER_PHONE_VERIFICATION_REQUIRED="false"
```

4. Test sending, wrong codes, expired codes, resending and successful checkout.
5. Require verification only after those tests pass:

```env
CUSTOMER_PHONE_VERIFICATION_REQUIRED="true"
```

6. Redeploy after changing Vercel environment variables.

If verification is required but the provider is not configured, customer checkout
fails closed with a clear unavailable message. Staff-created orders are unaffected.

## Change Provider Later

Implement another `PhoneVerificationProvider` adapter in
`lib/phone-verification-provider.ts` and select it in the provider resolver. The
profile, checkout, database and user interface do not need a provider-specific
rewrite.

Changing providers does not invalidate phone numbers that were already verified.
Changing a customer's saved phone number always clears its verified status.

## Launch Note

The application currently adds local request limits, and Twilio Verify supplies its
own delivery controls. A shared Redis or database-backed application rate limiter is
still recommended before a high-volume public launch because local limits are not
shared across Vercel function instances.
