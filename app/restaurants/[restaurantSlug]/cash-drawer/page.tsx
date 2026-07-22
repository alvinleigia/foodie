import { SaasAdminShell } from "@/components/admin/SaasAdminShell";
import { CashDrawerPanel } from "@/components/staff/CashDrawerPanel";
import {
  getCashDrawerOpeningContext,
  getOpenCashDrawerSession,
} from "@/lib/cash-drawer-sessions";
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
        currency={openingContext?.currency ?? ""}
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
