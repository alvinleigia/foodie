import "server-only";

import { and, eq, or } from "drizzle-orm";

import { getDb } from "@/db";
import { memberships, organizations, users } from "@/db/schema";
import { verifyPassword } from "@/lib/passwords";
import { checkRateLimit } from "@/lib/rate-limit";
import type { MembershipRole } from "@/lib/staff-auth";
import type { ManagerApprovalCredentials } from "@/lib/validations/manager-approval";

type ApprovalActor = {
  id: string;
  organizationId?: string;
  role: MembershipRole;
  username?: string;
};

export type ManagerApproval = {
  approvedByUserId: string;
  approvedByUsername: string;
  mode: "MANAGER_CREDENTIALS" | "MANAGER_SESSION";
  organizationId: string;
};

export class ManagerApprovalError extends Error {
  status: number;

  constructor(message: string, status = 403) {
    super(message);
    this.name = "ManagerApprovalError";
    this.status = status;
  }
}

function approvalFromActor(
  actor: ApprovalActor,
  organizationId: string,
): ManagerApproval {
  return {
    approvedByUserId: actor.id,
    approvedByUsername: actor.username ?? "manager",
    mode: "MANAGER_SESSION",
    organizationId,
  };
}

export async function authorizeManagerAction(input: {
  actor: ApprovalActor;
  credentials?: ManagerApprovalCredentials;
  organizationId: string;
}) {
  if (input.actor.organizationId !== input.organizationId) {
    throw new ManagerApprovalError("Manager approval is outside this restaurant.");
  }

  if (input.actor.role === "RESTAURANT_MANAGER") {
    return approvalFromActor(input.actor, input.organizationId);
  }

  const identifier = input.credentials?.identifier.trim().toLowerCase() ?? "";
  const password = input.credentials?.password ?? "";

  if (!identifier || !password) {
    throw new ManagerApprovalError("Restaurant manager approval is required.");
  }

  const rateLimit = await checkRateLimit({
    key: `manager-approval:${input.organizationId}:${identifier}`,
    limit: 10,
    windowMs: 15 * 60_000,
  });

  if (!rateLimit.allowed) {
    throw new ManagerApprovalError(
      "Too many manager approval attempts. Try again later.",
      429,
    );
  }

  const [manager] = await getDb()
    .select({
      id: users.id,
      passwordHash: users.passwordHash,
      username: users.username,
    })
    .from(users)
    .innerJoin(memberships, eq(memberships.userId, users.id))
    .innerJoin(organizations, eq(organizations.id, memberships.organizationId))
    .where(
      and(
        or(eq(users.username, identifier), eq(users.email, identifier)),
        eq(users.status, "ACTIVE"),
        eq(memberships.organizationId, input.organizationId),
        eq(memberships.role, "RESTAURANT_MANAGER"),
        eq(memberships.isActive, true),
        eq(organizations.isActive, true),
      ),
    )
    .limit(1);

  if (!manager || !(await verifyPassword(password, manager.passwordHash))) {
    throw new ManagerApprovalError("Manager credentials are invalid.");
  }

  return {
    approvedByUserId: manager.id,
    approvedByUsername: manager.username,
    mode: "MANAGER_CREDENTIALS" as const,
    organizationId: input.organizationId,
  };
}

export function assertManagerApproval(
  approval: ManagerApproval | undefined,
  organizationId: string,
) {
  if (!approval || approval.organizationId !== organizationId) {
    throw new ManagerApprovalError("Restaurant manager approval is required.");
  }
}
