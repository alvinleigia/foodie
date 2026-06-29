export const PLATFORM_ORGANIZATION_ID = "00000000-0000-0000-0000-000000000000";

export function isPlatformOrganizationId(organizationId: string | null | undefined) {
  return organizationId === PLATFORM_ORGANIZATION_ID;
}
