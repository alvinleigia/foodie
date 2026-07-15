const domainPattern =
  /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;

function resolveRootDomain(value: string | undefined) {
  const domain = value?.trim().toLowerCase().replace(/\.$/, "");

  if (!domain) {
    throw new Error("APP_ROOT_DOMAIN is required for this deployment cell.");
  }

  if (!domainPattern.test(domain)) {
    throw new Error(
      "APP_ROOT_DOMAIN must be a hostname without a protocol, path or port.",
    );
  }

  return domain;
}

export const ROOT_DOMAIN = resolveRootDomain(process.env.APP_ROOT_DOMAIN);

export function normalizeDomain(value: string | null | undefined) {
  const rawHost = value?.split(",")[0]?.trim().toLowerCase();

  if (!rawHost) {
    return null;
  }

  const withoutProtocol = rawHost.replace(/^https?:\/\//, "");
  const withoutPath = withoutProtocol.split("/")[0];
  const withoutPort = withoutPath.split(":")[0];
  const normalized = withoutPort.replace(/\.$/, "");

  return normalized || null;
}

export function isPlatformAdministrationDomain(
  domainValue: string | null | undefined,
) {
  const domain = normalizeDomain(domainValue);

  return Boolean(
    domain &&
      (domain === ROOT_DOMAIN || domain === "localhost" || domain === "127.0.0.1"),
  );
}

export function getRequestHost(request: Request) {
  return (
    request.headers.get("x-forwarded-host") ??
    request.headers.get("host") ??
    new URL(request.url).host
  );
}

export function isPlatformAdministrationRequest(request: Request) {
  return isPlatformAdministrationDomain(getRequestHost(request));
}

export function getPlatformAdministrationOrigin() {
  return `https://${ROOT_DOMAIN}`;
}
