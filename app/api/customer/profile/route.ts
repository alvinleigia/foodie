import { NextResponse } from "next/server";

import { requireCustomerSession } from "@/lib/auth";
import {
  getCustomerProfile,
  updateCustomerProfile,
} from "@/lib/customer-account";
import {
  assertOrganizationFeatureEnabled,
  FeatureEntitlementError,
} from "@/lib/feature-entitlements";
import { getPublicTenantContextFromRequest } from "@/lib/tenant-context";
import { customerProfileUpdateSchema } from "@/lib/validations/customer";

export async function GET(request: Request) {
  const session = await requireCustomerSession();

  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const tenantContext = await getPublicTenantContextFromRequest(request);
    await assertOrganizationFeatureEnabled(
      tenantContext.organizationId,
      "ordering.customer_accounts",
    );
    const customer = await getCustomerProfile(session.user.id, tenantContext);

    if (!customer) {
      return NextResponse.json(
        { error: "Customer profile not found." },
        { status: 404 },
      );
    }

    return NextResponse.json({ customer });
  } catch (error) {
    if (error instanceof FeatureEntitlementError) {
      return NextResponse.json({ error: error.message }, { status: 403 });
    }

    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to load profile." },
      { status: 500 },
    );
  }
}

export async function PATCH(request: Request) {
  const session = await requireCustomerSession();

  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const parsed = customerProfileUpdateSchema.safeParse(await request.json());

  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  try {
    const tenantContext = await getPublicTenantContextFromRequest(request);
    await assertOrganizationFeatureEnabled(
      tenantContext.organizationId,
      "ordering.customer_accounts",
    );
    const customer = await updateCustomerProfile(
      session.user.id,
      tenantContext,
      parsed.data,
    );

    if (!customer) {
      return NextResponse.json(
        { error: "Customer profile not found." },
        { status: 404 },
      );
    }

    return NextResponse.json({ customer });
  } catch (error) {
    if (error instanceof FeatureEntitlementError) {
      return NextResponse.json({ error: error.message }, { status: 403 });
    }

    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to update profile." },
      { status: 500 },
    );
  }
}
