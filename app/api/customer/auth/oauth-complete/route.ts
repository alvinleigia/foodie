import { type NextRequest, NextResponse } from "next/server";

import {
  customerSocialAuth,
  customerSocialSessionCookieName,
} from "@/customer-social-auth";
import { createCustomerAuthHandoff } from "@/lib/customer-auth-handoff";
import {
  customerOAuthContextCookieName,
  getCustomerOAuthContextFromRequest,
} from "@/lib/customer-oauth-context";
import {
  getPlatformAdministrationOrigin,
  isPlatformAdministrationRequest,
} from "@/lib/deployment-domain";
import { assertOrganizationFeaturesEnabled } from "@/lib/feature-entitlements";

function clearOAuthContext(response: NextResponse) {
  response.cookies.delete(customerOAuthContextCookieName);
  response.cookies.delete(customerSocialSessionCookieName);
  return response;
}

export async function GET(request: NextRequest) {
  const platformOrigin = getPlatformAdministrationOrigin(request);

  if (!isPlatformAdministrationRequest(request)) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const [session, context] = await Promise.all([
    customerSocialAuth(),
    Promise.resolve(getCustomerOAuthContextFromRequest(request)),
  ]);

  if (session?.user.kind !== "customer" || !context) {
    return clearOAuthContext(
      NextResponse.redirect(new URL("/", platformOrigin)),
    );
  }

  try {
    await assertOrganizationFeaturesEnabled(
      context.organizationId,
      ["ordering.customer_accounts", "auth.social"],
    );
  } catch {
    return clearOAuthContext(
      NextResponse.redirect(
        new URL(context.returnTo, context.destinationOrigin),
      ),
    );
  }

  const token = await createCustomerAuthHandoff({
    customerId: session.user.id,
    destinationOrigin: context.destinationOrigin,
    organizationId: context.organizationId,
    returnTo: context.returnTo,
  });
  const handoffUrl = new URL(
    "/customer/auth/handoff",
    context.destinationOrigin,
  );
  handoffUrl.searchParams.set("token", token);
  handoffUrl.searchParams.set("returnTo", context.returnTo);

  return clearOAuthContext(NextResponse.redirect(handoffUrl));
}
