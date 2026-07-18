import { type NextRequest, NextResponse } from "next/server";

import {
  getPlatformAdministrationOrigin,
  isPlatformAdministrationDomain,
} from "@/lib/deployment-domain";

export function proxy(request: NextRequest) {
  const requestHost =
    request.headers.get("x-forwarded-host") ?? request.headers.get("host");

  if (isPlatformAdministrationDomain(requestHost)) {
    return NextResponse.next();
  }

  const destination = new URL(
    `${request.nextUrl.pathname}${request.nextUrl.search}`,
    getPlatformAdministrationOrigin(),
  );

  return NextResponse.redirect(destination);
}

export const config = {
  matcher: [
    "/api/customer-social-auth/:path*",
    "/companies/:path*",
    "/customer/auth/social",
    "/invite/:path*",
    "/platform/:path*",
    "/reset-password/:path*",
    "/restaurants/:path*",
    "/staff/:path*",
    "/users/:path*",
  ],
};
