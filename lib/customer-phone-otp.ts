import { getOrCreatePhoneCustomer } from "@/lib/customer-auth";
import { getPhoneVerificationProvider } from "@/lib/phone-verification-provider";
import { customerPhoneOtpVerifySchema } from "@/lib/validations/customer-phone-otp";

export async function authenticateCustomerPhoneOtp(credentials: unknown) {
  const parsed = customerPhoneOtpVerifySchema.safeParse(credentials);

  if (!parsed.success) {
    return null;
  }

  const provider = getPhoneVerificationProvider();

  if (!provider || !(await provider.check(parsed.data.phone, parsed.data.code))) {
    return null;
  }

  return getOrCreatePhoneCustomer(parsed.data.phone);
}
