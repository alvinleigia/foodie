import { desc, eq, inArray } from "drizzle-orm";

import { getDb } from "@/db";
import { auditLogs, organizations } from "@/db/schema";
import { logError } from "@/lib/logger";
import type { MembershipRole } from "@/lib/staff-auth";

type AuditActor = {
  id?: string;
  username?: string;
  role?: MembershipRole;
  organizationId?: string;
};

type AuditLogInput = {
  actor?: AuditActor | null;
  organizationId?: string | null;
  action: string;
  entityType: string;
  entityId?: string | null;
  metadata?: Record<string, unknown>;
};

type AuditViewer = {
  role: MembershipRole;
  organizationId?: string | null;
};

function nullableId(value: string | null | undefined) {
  return value ? value : null;
}

export async function writeAuditLog(input: AuditLogInput) {
  try {
    const organizationId =
      "organizationId" in input
        ? nullableId(input.organizationId)
        : nullableId(input.actor?.organizationId);
    await getDb().insert(auditLogs).values({
      actorUserId: nullableId(input.actor?.id),
      actorUsername: input.actor?.username || null,
      actorRole: input.actor?.role || null,
      organizationId,
      action: input.action,
      entityType: input.entityType,
      entityId: input.entityId ?? null,
      metadata: input.metadata,
    });
  } catch (error) {
    logError("audit_log_write_failed", error, {
      action: input.action,
      entityType: input.entityType,
      entityId: input.entityId,
    });
  }
}

async function getCompanyScopedOrganizationIds(companyOrganizationId: string) {
  const restaurants = await getDb()
    .select({ id: organizations.id })
    .from(organizations)
    .where(eq(organizations.parentOrganizationId, companyOrganizationId));

  return [companyOrganizationId, ...restaurants.map((restaurant) => restaurant.id)];
}

async function getAuditWhere(viewer: AuditViewer) {
  if (viewer.role === "PLATFORM_ADMIN") {
    return undefined;
  }

  const organizationId = nullableId(viewer.organizationId);

  if (!organizationId) {
    return eq(auditLogs.id, "00000000-0000-0000-0000-000000000000");
  }

  if (viewer.role === "COMPANY_OWNER") {
    const organizationIds = await getCompanyScopedOrganizationIds(organizationId);
    return inArray(auditLogs.organizationId, organizationIds);
  }

  return eq(auditLogs.organizationId, organizationId);
}

export type AuditLogRow = {
  id: string;
  actorUsername: string | null;
  actorRole: MembershipRole | null;
  organizationId: string | null;
  action: string;
  entityType: string;
  entityId: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: string;
};

export async function listAuditLogsForViewer(viewer: AuditViewer, limit = 100) {
  const where = await getAuditWhere(viewer);
  const rows = await getDb()
    .select()
    .from(auditLogs)
    .where(where)
    .orderBy(desc(auditLogs.createdAt))
    .limit(Math.min(Math.max(limit, 1), 250));

  return rows.map((row) => ({
    ...row,
    createdAt: row.createdAt.toISOString(),
  })) satisfies AuditLogRow[];
}

function csvEscape(value: unknown) {
  const stringValue =
    value == null
      ? ""
      : typeof value === "object"
        ? JSON.stringify(value)
        : String(value);

  return `"${stringValue.replaceAll('"', '""')}"`;
}

export function auditLogsToCsv(rows: AuditLogRow[]) {
  const headers = [
    "created_at",
    "actor_username",
    "actor_role",
    "organization_id",
    "action",
    "entity_type",
    "entity_id",
    "metadata",
  ];
  const body = rows.map((row) =>
    [
      row.createdAt,
      row.actorUsername,
      row.actorRole,
      row.organizationId,
      row.action,
      row.entityType,
      row.entityId,
      row.metadata,
    ]
      .map(csvEscape)
      .join(","),
  );

  return [headers.join(","), ...body].join("\n");
}
