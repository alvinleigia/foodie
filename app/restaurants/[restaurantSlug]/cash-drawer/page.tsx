import { SaasAdminShell } from "@/components/admin/SaasAdminShell";
import { CashDrawerPanel } from "@/components/staff/CashDrawerPanel";
import { getOpenCashDrawerReconciliation } from "@/lib/cash-drawer-reconciliation";
import {
  getCashDrawerOpeningContext,
  getOpenCashDrawerSession,
} from "@/lib/cash-drawer-sessions";
import { listOpenCashDrawerMovements } from "@/lib/cash-drawer-movements";
import {
  getRestaurantWorkspaceHref,
  type RestaurantWorkspacePageProps,
} from "@/lib/restaurant-workspace";
import { requireRestaurantWorkspaceAccess } from "@/lib/restaurant-workspace-access";

function formatOpenedAt(value: Date, timezone: string) {
  return new Intl.DateTimeFormat("en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: timezone,
  }).format(value);
}

export default async function RestaurantCashDrawerPage({
  params,
}: RestaurantWorkspacePageProps) {
  const { restaurantSlug } = await params;
  const { access, session } = await requireRestaurantWorkspaceAccess({
    destination: "cashDrawer",
    requiredPermission: "cash_drawer.open",
    restaurantSlug,
  });
  const orderingPointId = access.tenantContext.orderingPointId;
  const openingContext = orderingPointId
    ? await getCashDrawerOpeningContext({
        orderingPointId,
        organizationId: access.restaurant.id,
      })
    : null;
  const openSession = openingContext
    ? await getOpenCashDrawerSession({
        orderingPointId: openingContext.id,
        organizationId: access.restaurant.id,
      })
    : null;
  const movements = openingContext
    ? await listOpenCashDrawerMovements({
        orderingPointId: openingContext.id,
        organizationId: access.restaurant.id,
      })
    : [];
  const canClose = session.user.permissions.includes("cash_drawer.close");
  const reconciliation =
    openingContext && openSession && canClose
      ? await getOpenCashDrawerReconciliation({
          orderingPointId: openingContext.id,
          organizationId: access.restaurant.id,
        })
      : null;

  return (
    <SaasAdminShell
      activePath={getRestaurantWorkspaceHref(
        access.restaurant.slug,
        "cashDrawer",
      )}
      description="Open the active till before collecting cash payments."
      eyebrow="Payments"
      title="Cash drawer"
      user={{
        name: session.user.name,
        organizationId: session.user.organizationId,
        permissions: session.user.permissions,
        role: session.user.role,
      }}
    >
      <CashDrawerPanel
        canAdjust={session.user.permissions.includes("cash_drawer.adjust")}
        canClose={canClose}
        currency={openingContext?.currency ?? ""}
        initialMovements={movements.map((movement) => ({
          ...movement,
          createdAtLabel: formatOpenedAt(
            movement.createdAt,
            openingContext?.timezone ?? "UTC",
          ),
        }))}
        initialSession={
          openSession && openingContext
            ? {
                currency: openSession.currency,
                id: openSession.id,
                openedAtLabel: formatOpenedAt(
                  openSession.openedAt,
                  openingContext.timezone,
                ),
                openingFloat: openSession.openingFloat,
                orderingPointId: openSession.orderingPointId,
                orderingPointName: openSession.orderingPointName,
                status: "OPEN",
              }
            : null
        }
        initialReconciliation={reconciliation}
        orderingPoint={
          openingContext
            ? { id: openingContext.id, name: openingContext.name }
            : null
        }
        timezone={openingContext?.timezone ?? ""}
      />
    </SaasAdminShell>
  );
}
