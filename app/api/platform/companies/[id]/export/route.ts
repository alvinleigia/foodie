import { NextResponse } from "next/server";

import { requireRole } from "@/lib/auth";
import { writeAuditLog } from "@/lib/audit-log";
import { getCompanyDataExport } from "@/lib/company-data-export";
import { platformAdminRoles } from "@/lib/role-access";

function safeFilename(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/^-+|-+$/g, "");
}

export async function GET(_request: Request, props: { params: Promise<{ id: string }> }) {
  const session = await requireRole([...platformAdminRoles]);

  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await props.params;
  const exportData = await getCompanyDataExport(id);

  if (!exportData) {
    return NextResponse.json({ error: "Company not found." }, { status: 404 });
  }

  const filename = `company-${safeFilename(exportData.company.slug)}-export.json`;
  await writeAuditLog({
    actor: session.user,
    organizationId: exportData.company.id,
    action: "platform.company.export",
    entityType: "organization",
    entityId: exportData.company.id,
    metadata: {
      filename,
      restaurantCount: exportData.restaurants.length,
      orderingPointCount: exportData.orderingPoints.length,
      orderCount: exportData.orders.length,
    },
  });

  return new Response(JSON.stringify(exportData, null, 2), {
    headers: {
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Content-Type": "application/json; charset=utf-8",
    },
  });
}
