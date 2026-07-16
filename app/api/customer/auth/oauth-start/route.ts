import { type NextRequest, NextResponse } from "next/server";

import {
  customerOAuthContextCookieName,
  customerOAuthContextMaxAgeSeconds,
  parseCustomerOAuthContextValue,
} from "@/lib/customer-oauth-context";
import {
  getPlatformAdministrationOrigin,
  isPlatformAdministrationRequest,
} from "@/lib/deployment-domain";

export async function GET(request: NextRequest) {
  const platformOrigin = getPlatformAdministrationOrigin(request);
  const state = request.nextUrl.searchParams.get("state") ?? "";
  const context = parseCustomerOAuthContextValue(state);

  if (!isPlatformAdministrationRequest(request) || !context) {
    return NextResponse.redirect(new URL("/", platformOrigin));
  }

  const response = NextResponse.redirect(
    new URL("/customer/auth/social", platformOrigin),
  );

  response.cookies.set({
    name: customerOAuthContextCookieName,
    value: state,
    httpOnly: true,
    maxAge: customerOAuthContextMaxAgeSeconds,
    path: "/",
    sameSite: context.provider === "apple" ? "none" : "lax",
    secure: new URL(platformOrigin).protocol === "https:",
  });

  return response;
}
