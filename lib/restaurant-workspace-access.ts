import { notFound, redirect } from "next/navigation";
import type { Session } from "next-auth";

import { auth } from "@/auth";
import { getTenantAdminSnapshot } from "@/lib/tenant-admin";
import { isSessionAccessAllowedForCurrentDomain } from "@/lib/domain-session";
import type { StaffPermission } from "@/lib/staff-permissions";
import { getCurrentStaffRestaurantAccess } from "@/lib/tenant-context";
import {
  getRestaurantWorkspaceHref,
  type RestaurantWorkspaceDestination,
} from "@/lib/restaurant-workspace";

type RestaurantWorkspaceAccessOptions = {
  destination: RestaurantWorkspaceDestination;
  requiredPermission: StaffPermission;
  restaurantSlug?: string;
};

type RestaurantWorkspaceStaffSession = Session & {
  user: Extract<Session["user"], { kind: "staff" }>;
};

function isStaffSession(
  session: Session | null,
): session is RestaurantWorkspaceStaffSession {
  return session?.user.kind === "staff";
}

export async function requireRestaurantWorkspaceAccess({
  destination,
  requiredPermission,
  restaurantSlug,
}: RestaurantWorkspaceAccessOptions) {
  const session = await auth();

  if (!isStaffSession(session)) {
    redirect("/staff/login");
  }

  if (!session.user.permissions.includes(requiredPermission)) {
    notFound();
  }

  if (!(await isSessionAccessAllowedForCurrentDomain(session.user))) {
    notFound();
  }

  const access = await getCurrentStaffRestaurantAccess().catch(() => null);

  if (!access) {
    notFound();
  }

  if (
    restaurantSlug &&
    access.restaurant.slug !== restaurantSlug.trim().toLowerCase()
  ) {
    redirect(getRestaurantWorkspaceHref(access.restaurant.slug, destination));
  }

  return { access, session };
}

export async function requireRestaurantWorkspaceAdminPage(
  options: RestaurantWorkspaceAccessOptions,
) {
  const result = await requireRestaurantWorkspaceAccess(options);
  const snapshot = await getTenantAdminSnapshot(result.access.tenantContext);

  if (!snapshot.organization) {
    redirect(
      getRestaurantWorkspaceHref(
        result.access.restaurant.slug,
        "dashboard",
      ),
    );
  }

  return { ...result, snapshot };
}
