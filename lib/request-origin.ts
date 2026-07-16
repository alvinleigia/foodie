import "server-only";

import { headers } from "next/headers";

export async function getRequestOrigin() {
  const requestHeaders = await headers();
  const host = (
    requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host") ?? "localhost"
  )
    .split(",")[0]
    .trim();
  const forwardedProtocol = requestHeaders
    .get("x-forwarded-proto")
    ?.split(",")[0]
    .trim();
  const protocol = forwardedProtocol || (host.startsWith("localhost") ? "http" : "https");

  return `${protocol}://${host}`;
}
