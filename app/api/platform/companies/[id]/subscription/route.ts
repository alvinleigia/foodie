import { NextResponse } from "next/server";

import { requireRole } from "@/lib/auth";
import { writeAuditLog } from "@/lib/audit-log";
import {
  SaasPlanUnavailableError,
  updateCompanySubscription,
} from "@/lib/billing";
import { platformAdminRoles } from "@/lib/role-access";
import { listPlatformCompanies } from "@/lib/saas-admin";
import { updateCompanySubscriptionSchema } from "@/lib/validations/tenant-admin";

export async function PATCH(request: Request, props: { params: Promise<{ id: string }> }) {
  const session = await requireRole([...platformAdminRoles]);

  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const parsed = updateCompanySubscriptionSchema.safeParse(await request.json());

  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const { id } = await props.params;
  let result;

  try {
    result = await updateCompanySubscription(id, parsed.data);
  } catch (error) {
    if (error instanceof SaasPlanUnavailableError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    throw error;
  }

  if (!result) {
    return NextResponse.json({ error: "Subscription not found." }, { status: 404 });
  }

  await writeAuditLog({
    actor: session.user,
    organizationId: id,
    action: "platform.subscription.update",
    entityType: "organization_subscription",
    entityId: result.subscription.id,
    metadata: {
      organizationId: id,
      planSlug: result.plan.slug,
      status: result.subscription.status,
    },
  });

  return NextResponse.json({ companies: await listPlatformCompanies() });
}
