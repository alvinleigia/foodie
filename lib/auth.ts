import { auth } from "@/auth";
import type { Session } from "next-auth";
import { assertTenantSubscriptionAccess } from "@/lib/billing";
import { isCurrentRequestPlatformAdministrationDomain } from "@/lib/domain-session";
import {
  canAccessRole,
  operationalRoles,
  platformAdminRoles,
} from "@/lib/role-access";
import type { StaffPermission } from "@/lib/staff-permissions";
import type { MembershipRole } from "@/lib/staff-auth";

type StaffSession = Session & {
  user: Extract<Session["user"], { kind: "staff" }>;
};

type CustomerSession = Session & {
  user: Extract<Session["user"], { kind: "customer" }>;
};

function isStaffSession(session: Session | null): session is StaffSession {
  return session?.user.kind === "staff";
}

function isCustomerSession(session: Session | null): session is CustomerSession {
  return session?.user.kind === "customer";
}

export async function requireStaffSession() {
  if (!(await isCurrentRequestPlatformAdministrationDomain())) {
    return null;
  }

  const session = await auth();

  if (
    !isStaffSession(session) ||
    !canAccessRole(session.user.role, operationalRoles)
  ) {
    return null;
  }

  try {
    await assertTenantSubscriptionAccess(session.user.organizationId);
  } catch {
    return null;
  }

  return session;
}

export async function requireStaffPermission(permission: StaffPermission) {
  if (!(await isCurrentRequestPlatformAdministrationDomain())) {
    return null;
  }

  const session = await auth();

  if (!isStaffSession(session) || !session.user.permissions.includes(permission)) {
    return null;
  }

  if (!canAccessRole(session.user.role, platformAdminRoles)) {
    try {
      await assertTenantSubscriptionAccess(session.user.organizationId);
    } catch {
      return null;
    }
  }

  return session;
}

export async function requireAnyStaffPermission(
  permissions: StaffPermission[],
) {
  if (!(await isCurrentRequestPlatformAdministrationDomain())) {
    return null;
  }

  const session = await auth();

  if (
    !isStaffSession(session) ||
    !permissions.some((permission) => session.user.permissions.includes(permission))
  ) {
    return null;
  }

  if (!canAccessRole(session.user.role, platformAdminRoles)) {
    try {
      await assertTenantSubscriptionAccess(session.user.organizationId);
    } catch {
      return null;
    }
  }

  return session;
}

export async function requireRole(allowedRoles: MembershipRole[]) {
  if (!(await isCurrentRequestPlatformAdministrationDomain())) {
    return null;
  }

  const session = await auth();

  if (
    !isStaffSession(session) ||
    !allowedRoles.includes(session.user.role)
  ) {
    return null;
  }

  if (!canAccessRole(session.user.role, platformAdminRoles)) {
    try {
      await assertTenantSubscriptionAccess(session.user.organizationId);
    } catch {
      return null;
    }
  }

  return session;
}

export async function requireMenuManagerSession() {
  return requireStaffPermission("menu.manage");
}

export async function requireCustomerSession() {
  const session = await auth();

  return isCustomerSession(session) ? session : null;
}
