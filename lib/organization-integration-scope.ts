import "server-only";

import { eq } from "drizzle-orm";

import { getDb } from "@/db";
import { organizations } from "@/db/schema";

export type IntegrationOrganization = {
  id: string;
  name: string;
  type: "COMPANY" | "RESTAURANT";
  parentOrganizationId: string | null;
};

type CompanyIntegrationOrganization = IntegrationOrganization & {
  type: "COMPANY";
};

export type OrganizationIntegrationScope = {
  organization: IntegrationOrganization;
  parent: CompanyIntegrationOrganization | null;
  lineage: IntegrationOrganization[];
};

async function getOrganization(organizationId: string) {
  const [organization] = await getDb()
    .select({
      id: organizations.id,
      name: organizations.name,
      type: organizations.type,
      parentOrganizationId: organizations.parentOrganizationId,
    })
    .from(organizations)
    .where(eq(organizations.id, organizationId))
    .limit(1);

  return organization ?? null;
}

export async function getOrganizationIntegrationScope(
  organizationId: string,
): Promise<OrganizationIntegrationScope | null> {
  const organization = await getOrganization(organizationId);

  if (!organization || !["COMPANY", "RESTAURANT"].includes(organization.type)) {
    return null;
  }

  const scopedOrganization = organization as IntegrationOrganization;

  if (scopedOrganization.type === "COMPANY") {
    return {
      organization: scopedOrganization,
      parent: null,
      lineage: [scopedOrganization],
    };
  }

  if (!scopedOrganization.parentOrganizationId) {
    throw new Error("Restaurant integration settings require a parent company.");
  }

  const parent = await getOrganization(scopedOrganization.parentOrganizationId);

  if (!parent || parent.type !== "COMPANY") {
    throw new Error("Restaurant integration settings require a valid parent company.");
  }

  const scopedParent = parent as CompanyIntegrationOrganization;

  return {
    organization: scopedOrganization,
    parent: scopedParent,
    lineage: [scopedOrganization, scopedParent],
  };
}
