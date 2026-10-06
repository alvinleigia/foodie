import { normalizeCustomerPhone } from "@/lib/validations/customer";

type GuestOrderClaimContact = {
  customerEmail: string | null;
  customerPhone: string | null;
};

type VerifiedCustomerContact = {
  email: string | null;
  emailVerifiedAt: Date | null;
  phone: string | null;
  phoneVerifiedAt: Date | null;
};

export function getGuestOrderClaimContactMatch(
  order: GuestOrderClaimContact,
  customer: VerifiedCustomerContact,
) {
  const emailMatches = Boolean(
    order.customerEmail &&
      customer.email &&
      customer.emailVerifiedAt &&
      order.customerEmail.trim().toLowerCase() ===
        customer.email.trim().toLowerCase(),
  );
  const phoneMatches = Boolean(
    order.customerPhone &&
      customer.phone &&
      customer.phoneVerifiedAt &&
      normalizeCustomerPhone(order.customerPhone) ===
        normalizeCustomerPhone(customer.phone),
  );

  return { emailMatches, phoneMatches };
}
