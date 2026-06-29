import { and, count, desc, eq, gte, inArray, ne, sql } from "drizzle-orm";

import { getDb } from "@/db";
import {
  inventoryItems,
  locations,
  memberships,
  menuCategories,
  menuItems,
  orderItems,
  orders,
  organizations,
  users,
} from "@/db/schema";

const activeOrderStatuses = ["PENDING", "PREPARING", "READY"] as const;
const allOrderStatuses = [
  "PENDING",
  "PREPARING",
  "READY",
  "DELIVERED",
  "CANCELLED",
] as const;

export type OrderStatusReportRow = {
  status: (typeof allOrderStatuses)[number];
  count: number;
};

export type LocationOrderReportRow = {
  id: string;
  name: string;
  label: string | null;
  isActive: boolean;
  activeOrders: number;
  deliveredOrders: number;
  cancelledOrders: number;
  totalOrders: number;
  lastOrderAt: string | null;
};

export type TopProductReportRow = {
  drinkName: string;
  categoryName: string;
  quantity: number;
  orderLines: number;
};

export type CategoryReportRow = {
  categoryName: string;
  quantity: number;
  orderLines: number;
};

export type StaffReportRow = {
  staffName: string;
  deliveredOrders: number;
  activeOrders: number;
  totalOrders: number;
};

export type TimingReport = {
  preparedItems: number;
  deliveredItems: number;
  averagePrepMinutes: number | null;
  averageCollectionMinutes: number | null;
};

export type CancelledItemReportRow = {
  drinkName: string;
  categoryName: string;
  quantity: number;
  cancelledLines: number;
};

export type RevenueReport = {
  grossRevenue: number;
  pricedLines: number;
  unpricedLines: number;
  averagePricedLineValue: number | null;
};

export type LowStockReportRow = {
  id: string;
  productName: string;
  currentQuantity: string;
  lowStockThreshold: string;
  unit: string;
  status: "low" | "out";
};

export type OperationalReport = {
  range: ReportRange;
  statusBreakdown: OrderStatusReportRow[];
  todayStatusBreakdown: OrderStatusReportRow[];
  topProducts: TopProductReportRow[];
  categoryBreakdown: CategoryReportRow[];
  staffBreakdown: StaffReportRow[];
  timing: TimingReport;
  cancelledItems: CancelledItemReportRow[];
  revenue: RevenueReport;
  lowStock: LowStockReportRow[];
  locationBreakdown: LocationOrderReportRow[];
};

export type ReportRange = "today" | "7d" | "30d" | "all";

function firstCount(rows: Array<{ value: number }>) {
  return Number(rows[0]?.value ?? 0);
}

function firstDate(rows: Array<{ createdAt: Date }>) {
  return rows[0]?.createdAt?.toISOString() ?? null;
}

function startOfToday() {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
}

function getRangeStart(range: ReportRange) {
  if (range === "all") {
    return undefined;
  }

  if (range === "today") {
    return startOfToday();
  }

  const now = new Date();
  const days = range === "7d" ? 7 : 30;
  return new Date(now.getFullYear(), now.getMonth(), now.getDate() - (days - 1));
}

function orderOrganizationCondition(organizationIds: string[]) {
  return organizationIds.length === 1
    ? eq(orders.organizationId, organizationIds[0])
    : inArray(orders.organizationId, organizationIds);
}

function orderItemOrganizationCondition(organizationIds: string[]) {
  return organizationIds.length === 1
    ? eq(orderItems.organizationId, organizationIds[0])
    : inArray(orderItems.organizationId, organizationIds);
}

function inventoryOrganizationCondition(organizationIds: string[]) {
  return organizationIds.length === 1
    ? eq(inventoryItems.organizationId, organizationIds[0])
    : inArray(inventoryItems.organizationId, organizationIds);
}

function countByStatus(rows: Array<{ status: string; value: number }>): OrderStatusReportRow[] {
  return allOrderStatuses.map((status) => ({
    status,
    count: Number(rows.find((row) => row.status === status)?.value ?? 0),
  }));
}

async function getOrderStatusBreakdown(
  organizationIds: string[],
  since?: Date,
): Promise<OrderStatusReportRow[]> {
  if (organizationIds.length === 0) {
    return countByStatus([]);
  }

  const db = getDb();
  const conditions = [orderOrganizationCondition(organizationIds)];

  if (since) {
    conditions.push(gte(orders.createdAt, since));
  }

  const rows = await db
    .select({
      status: orders.status,
      value: count(),
    })
    .from(orders)
    .where(and(...conditions))
    .groupBy(orders.status);

  return countByStatus(rows);
}

async function getTopProducts(
  organizationIds: string[],
  since?: Date,
): Promise<TopProductReportRow[]> {
  if (organizationIds.length === 0) {
    return [];
  }

  const quantityTotal = sql<number>`coalesce(sum(${orderItems.quantity}), 0)`;
  const conditions = [
    orderItemOrganizationCondition(organizationIds),
    ne(orderItems.status, "CANCELLED"),
  ];

  if (since) {
    conditions.push(gte(orderItems.createdAt, since));
  }

  const rows = await getDb()
    .select({
      drinkName: orderItems.drinkName,
      categoryName: orderItems.categoryName,
      quantity: quantityTotal,
      orderLines: count(),
    })
    .from(orderItems)
    .where(and(...conditions))
    .groupBy(orderItems.drinkName, orderItems.categoryName)
    .orderBy(desc(quantityTotal))
    .limit(5);

  return rows.map((row) => ({
    drinkName: row.drinkName,
    categoryName: row.categoryName,
    quantity: Number(row.quantity ?? 0),
    orderLines: Number(row.orderLines ?? 0),
  }));
}

async function getCategoryBreakdown(
  organizationIds: string[],
  since?: Date,
): Promise<CategoryReportRow[]> {
  if (organizationIds.length === 0) {
    return [];
  }

  const quantityTotal = sql<number>`coalesce(sum(${orderItems.quantity}), 0)`;
  const conditions = [
    orderItemOrganizationCondition(organizationIds),
    ne(orderItems.status, "CANCELLED"),
  ];

  if (since) {
    conditions.push(gte(orderItems.createdAt, since));
  }

  const rows = await getDb()
    .select({
      categoryName: orderItems.categoryName,
      quantity: quantityTotal,
      orderLines: count(),
    })
    .from(orderItems)
    .where(and(...conditions))
    .groupBy(orderItems.categoryName)
    .orderBy(desc(quantityTotal))
    .limit(6);

  return rows.map((row) => ({
    categoryName: row.categoryName,
    quantity: Number(row.quantity ?? 0),
    orderLines: Number(row.orderLines ?? 0),
  }));
}

async function getStaffBreakdown(
  organizationIds: string[],
  since?: Date,
): Promise<StaffReportRow[]> {
  if (organizationIds.length === 0) {
    return [];
  }

  const conditions = [
    orderOrganizationCondition(organizationIds),
    sql`${orders.preparedById} is not null`,
  ];

  if (since) {
    conditions.push(gte(orders.createdAt, since));
  }

  const rows = await getDb()
    .select({
      staffName: users.name,
      deliveredOrders: sql<number>`count(*) filter (where ${orders.status} = 'DELIVERED')`,
      activeOrders: sql<number>`count(*) filter (where ${orders.status} in ('PENDING', 'PREPARING', 'READY'))`,
      totalOrders: count(),
    })
    .from(orders)
    .innerJoin(users, eq(users.id, orders.preparedById))
    .where(and(...conditions))
    .groupBy(users.name)
    .orderBy(desc(sql<number>`count(*)`))
    .limit(6);

  return rows.map((row) => ({
    staffName: row.staffName,
    deliveredOrders: Number(row.deliveredOrders ?? 0),
    activeOrders: Number(row.activeOrders ?? 0),
    totalOrders: Number(row.totalOrders ?? 0),
  }));
}

async function getTimingReport(
  organizationIds: string[],
  since?: Date,
): Promise<TimingReport> {
  if (organizationIds.length === 0) {
    return {
      preparedItems: 0,
      deliveredItems: 0,
      averagePrepMinutes: null,
      averageCollectionMinutes: null,
    };
  }

  const conditions = [orderItemOrganizationCondition(organizationIds)];

  if (since) {
    conditions.push(gte(orderItems.createdAt, since));
  }

  const rows = await getDb()
    .select({
      preparedItems: sql<number>`count(*) filter (where ${orderItems.startedAt} is not null and ${orderItems.readyAt} is not null)`,
      deliveredItems: sql<number>`count(*) filter (where ${orderItems.readyAt} is not null and ${orderItems.deliveredAt} is not null)`,
      averagePrepMinutes: sql<number | null>`avg(extract(epoch from (${orderItems.readyAt} - ${orderItems.startedAt})) / 60) filter (where ${orderItems.startedAt} is not null and ${orderItems.readyAt} is not null)`,
      averageCollectionMinutes: sql<number | null>`avg(extract(epoch from (${orderItems.deliveredAt} - ${orderItems.readyAt})) / 60) filter (where ${orderItems.readyAt} is not null and ${orderItems.deliveredAt} is not null)`,
    })
    .from(orderItems)
    .where(and(...conditions));

  const row = rows[0];

  return {
    preparedItems: Number(row?.preparedItems ?? 0),
    deliveredItems: Number(row?.deliveredItems ?? 0),
    averagePrepMinutes:
      row?.averagePrepMinutes == null ? null : Number(row.averagePrepMinutes),
    averageCollectionMinutes:
      row?.averageCollectionMinutes == null
        ? null
        : Number(row.averageCollectionMinutes),
  };
}

async function getCancelledItemBreakdown(
  organizationIds: string[],
  since?: Date,
): Promise<CancelledItemReportRow[]> {
  if (organizationIds.length === 0) {
    return [];
  }

  const quantityTotal = sql<number>`coalesce(sum(${orderItems.quantity}), 0)`;
  const conditions = [
    orderItemOrganizationCondition(organizationIds),
    eq(orderItems.status, "CANCELLED"),
  ];

  if (since) {
    conditions.push(gte(orderItems.createdAt, since));
  }

  const rows = await getDb()
    .select({
      drinkName: orderItems.drinkName,
      categoryName: orderItems.categoryName,
      quantity: quantityTotal,
      cancelledLines: count(),
    })
    .from(orderItems)
    .where(and(...conditions))
    .groupBy(orderItems.drinkName, orderItems.categoryName)
    .orderBy(desc(quantityTotal))
    .limit(6);

  return rows.map((row) => ({
    drinkName: row.drinkName,
    categoryName: row.categoryName,
    quantity: Number(row.quantity ?? 0),
    cancelledLines: Number(row.cancelledLines ?? 0),
  }));
}

async function getRevenueReport(
  organizationIds: string[],
  since?: Date,
): Promise<RevenueReport> {
  if (organizationIds.length === 0) {
    return {
      grossRevenue: 0,
      pricedLines: 0,
      unpricedLines: 0,
      averagePricedLineValue: null,
    };
  }

  const conditions = [
    orderItemOrganizationCondition(organizationIds),
    ne(orderItems.status, "CANCELLED"),
  ];

  if (since) {
    conditions.push(gte(orderItems.createdAt, since));
  }

  const rows = await getDb()
    .select({
      grossRevenue: sql<number>`coalesce(sum(${orderItems.unitPrice} * ${orderItems.quantity}) filter (where ${orderItems.unitPrice} is not null), 0)`,
      pricedLines: sql<number>`count(*) filter (where ${orderItems.unitPrice} is not null)`,
      unpricedLines: sql<number>`count(*) filter (where ${orderItems.unitPrice} is null)`,
      averagePricedLineValue: sql<number | null>`avg(${orderItems.unitPrice} * ${orderItems.quantity}) filter (where ${orderItems.unitPrice} is not null)`,
    })
    .from(orderItems)
    .where(and(...conditions));

  const row = rows[0];

  return {
    grossRevenue: Number(row?.grossRevenue ?? 0),
    pricedLines: Number(row?.pricedLines ?? 0),
    unpricedLines: Number(row?.unpricedLines ?? 0),
    averagePricedLineValue:
      row?.averagePricedLineValue == null
        ? null
        : Number(row.averagePricedLineValue),
  };
}

async function getLowStockReport(organizationIds: string[]): Promise<LowStockReportRow[]> {
  if (organizationIds.length === 0) {
    return [];
  }

  const rows = await getDb()
    .select({
      id: inventoryItems.id,
      productName: menuItems.name,
      currentQuantity: inventoryItems.currentQuantity,
      lowStockThreshold: inventoryItems.lowStockThreshold,
      unit: inventoryItems.unit,
      status: sql<"low" | "out">`case when ${inventoryItems.currentQuantity} <= 0 then 'out' else 'low' end`,
    })
    .from(inventoryItems)
    .innerJoin(menuItems, eq(menuItems.id, inventoryItems.menuItemId))
    .where(
      and(
        inventoryOrganizationCondition(organizationIds),
        eq(inventoryItems.isTracked, true),
        sql`${inventoryItems.currentQuantity} <= ${inventoryItems.lowStockThreshold}`,
      ),
    )
    .orderBy(inventoryItems.currentQuantity, menuItems.name)
    .limit(8);

  return rows;
}

async function getLocationOrderBreakdown(
  organizationIds: string[],
  since?: Date,
): Promise<LocationOrderReportRow[]> {
  if (organizationIds.length === 0) {
    return [];
  }

  const db = getDb();
  const locationRows = await db
    .select()
    .from(locations)
    .where(
      organizationIds.length === 1
        ? eq(locations.organizationId, organizationIds[0])
        : inArray(locations.organizationId, organizationIds),
    );

  return Promise.all(
    locationRows.map(async (location) => {
      const baseConditions = [eq(orders.locationId, location.id)];

      if (since) {
        baseConditions.push(gte(orders.createdAt, since));
      }

      const [
        activeOrders,
        deliveredOrders,
        cancelledOrders,
        totalOrders,
        lastOrder,
      ] = await Promise.all([
        db
          .select({ value: count() })
          .from(orders)
          .where(
            and(
              ...baseConditions,
              inArray(orders.status, activeOrderStatuses),
            ),
          ),
        db
          .select({ value: count() })
          .from(orders)
          .where(and(...baseConditions, eq(orders.status, "DELIVERED"))),
        db
          .select({ value: count() })
          .from(orders)
          .where(and(...baseConditions, eq(orders.status, "CANCELLED"))),
        db
          .select({ value: count() })
          .from(orders)
          .where(and(...baseConditions)),
        db
          .select({ createdAt: orders.createdAt })
          .from(orders)
          .where(and(...baseConditions))
          .orderBy(desc(orders.createdAt))
          .limit(1),
      ]);

      return {
        id: location.id,
        name: location.name,
        label: location.label,
        isActive: location.isActive,
        activeOrders: firstCount(activeOrders),
        deliveredOrders: firstCount(deliveredOrders),
        cancelledOrders: firstCount(cancelledOrders),
        totalOrders: firstCount(totalOrders),
        lastOrderAt: firstDate(lastOrder),
      };
    }),
  );
}

async function getOperationalReportForOrganizations(
  organizationIds: string[],
  range: ReportRange = "30d",
): Promise<OperationalReport> {
  const since = getRangeStart(range);

  const [
    statusBreakdown,
    todayStatusBreakdown,
    topProducts,
    categoryBreakdown,
    staffBreakdown,
    timing,
    cancelledItems,
    revenue,
    lowStock,
    locationBreakdown,
  ] = await Promise.all([
    getOrderStatusBreakdown(organizationIds, since),
    getOrderStatusBreakdown(organizationIds, startOfToday()),
    getTopProducts(organizationIds, since),
    getCategoryBreakdown(organizationIds, since),
    getStaffBreakdown(organizationIds, since),
    getTimingReport(organizationIds, since),
    getCancelledItemBreakdown(organizationIds, since),
    getRevenueReport(organizationIds, since),
    getLowStockReport(organizationIds),
    getLocationOrderBreakdown(organizationIds, since),
  ]);

  return {
    range,
    statusBreakdown,
    todayStatusBreakdown,
    topProducts,
    categoryBreakdown,
    staffBreakdown,
    timing,
    cancelledItems,
    revenue,
    lowStock,
    locationBreakdown,
  };
}

export async function getPlatformSummary() {
  const db = getDb();
  const [companies, restaurants, activeLocations, staff, activeOrders, completedOrders] =
    await Promise.all([
      db
        .select({ value: count() })
        .from(organizations)
        .where(eq(organizations.type, "COMPANY")),
      db
        .select({ value: count() })
        .from(organizations)
        .where(eq(organizations.type, "RESTAURANT")),
      db
        .select({ value: count() })
        .from(locations)
        .where(eq(locations.isActive, true)),
      db
        .select({ value: count() })
        .from(memberships)
        .where(eq(memberships.isActive, true)),
      db
        .select({ value: count() })
        .from(orders)
        .where(inArray(orders.status, activeOrderStatuses)),
      db
        .select({ value: count() })
        .from(orders)
        .where(ne(orders.status, "CANCELLED")),
    ]);

  return {
    companyTenants: firstCount(companies),
    restaurantTenants: firstCount(restaurants),
    activeLocations: firstCount(activeLocations),
    activeStaffMemberships: firstCount(staff),
    activeOrders: firstCount(activeOrders),
    completedOrders: firstCount(completedOrders),
  };
}

export async function getPlatformCompanyBreakdown() {
  const db = getDb();
  const companies = await listReportCompanies();

  return Promise.all(
    companies.map(async (company) => {
      const childRestaurants = await db
        .select({ id: organizations.id })
        .from(organizations)
        .where(
          and(
            eq(organizations.parentOrganizationId, company.id),
            eq(organizations.type, "RESTAURANT"),
          ),
        );
      const childRestaurantIds = childRestaurants.map((restaurant) => restaurant.id);

      if (childRestaurantIds.length === 0) {
        return {
          id: company.id,
          name: company.name,
          slug: company.slug,
          isActive: company.isActive,
          childRestaurants: 0,
          activeLocations: 0,
          activeStaffMemberships: 0,
          activeOrders: 0,
          completedOrders: 0,
          cancelledOrders: 0,
          lastOrderAt: null,
        };
      }

      const [
        activeLocations,
        staff,
        activeOrders,
        completedOrders,
        cancelledOrders,
        lastOrder,
      ] = await Promise.all([
        db
          .select({ value: count() })
          .from(locations)
          .where(
            and(
              inArray(locations.organizationId, childRestaurantIds),
              eq(locations.isActive, true),
            ),
          ),
        db
          .select({ value: count() })
          .from(memberships)
          .where(
            and(
              inArray(memberships.organizationId, childRestaurantIds),
              eq(memberships.isActive, true),
            ),
          ),
        db
          .select({ value: count() })
          .from(orders)
          .where(
            and(
              inArray(orders.organizationId, childRestaurantIds),
              inArray(orders.status, activeOrderStatuses),
            ),
          ),
        db
          .select({ value: count() })
          .from(orders)
          .where(
            and(
              inArray(orders.organizationId, childRestaurantIds),
              ne(orders.status, "CANCELLED"),
            ),
          ),
        db
          .select({ value: count() })
          .from(orders)
          .where(
            and(
              inArray(orders.organizationId, childRestaurantIds),
              eq(orders.status, "CANCELLED"),
            ),
          ),
        db
          .select({ createdAt: orders.createdAt })
          .from(orders)
          .where(inArray(orders.organizationId, childRestaurantIds))
          .orderBy(desc(orders.createdAt))
          .limit(1),
      ]);

      return {
        id: company.id,
        name: company.name,
        slug: company.slug,
        isActive: company.isActive,
        childRestaurants: childRestaurantIds.length,
        activeLocations: firstCount(activeLocations),
        activeStaffMemberships: firstCount(staff),
        activeOrders: firstCount(activeOrders),
        completedOrders: firstCount(completedOrders),
        cancelledOrders: firstCount(cancelledOrders),
        lastOrderAt: firstDate(lastOrder),
      };
    }),
  );
}

export async function getCompanySummary(companyOrganizationId: string) {
  const db = getDb();
  const childRestaurants = await db
    .select({ id: organizations.id })
    .from(organizations)
    .where(
      and(
        eq(organizations.parentOrganizationId, companyOrganizationId),
        eq(organizations.type, "RESTAURANT"),
      ),
    );
  const childRestaurantIds = childRestaurants.map((restaurant) => restaurant.id);

  if (childRestaurantIds.length === 0) {
    return {
      childRestaurants: 0,
      activeLocations: 0,
      activeStaffMemberships: 0,
      activeMenuCategories: 0,
      activeMenuItems: 0,
      activeOrders: 0,
      completedOrders: 0,
    };
  }

  const [
    activeLocations,
    staff,
    activeCategories,
    activeItems,
    activeOrders,
    completedOrders,
  ] = await Promise.all([
    db
      .select({ value: count() })
      .from(locations)
      .where(
        and(
          inArray(locations.organizationId, childRestaurantIds),
          eq(locations.isActive, true),
        ),
      ),
    db
      .select({ value: count() })
      .from(memberships)
      .where(
        and(
          inArray(memberships.organizationId, childRestaurantIds),
          eq(memberships.isActive, true),
        ),
      ),
    db
      .select({ value: count() })
      .from(menuCategories)
      .where(
        and(
          inArray(menuCategories.organizationId, childRestaurantIds),
          eq(menuCategories.isActive, true),
        ),
      ),
    db
      .select({ value: count() })
      .from(menuItems)
      .where(
        and(
          inArray(menuItems.organizationId, childRestaurantIds),
          eq(menuItems.isActive, true),
        ),
      ),
    db
      .select({ value: count() })
      .from(orders)
      .where(
        and(
          inArray(orders.organizationId, childRestaurantIds),
          inArray(orders.status, activeOrderStatuses),
        ),
      ),
    db
      .select({ value: count() })
      .from(orders)
      .where(
        and(
          inArray(orders.organizationId, childRestaurantIds),
          ne(orders.status, "CANCELLED"),
        ),
      ),
  ]);

  return {
    childRestaurants: childRestaurantIds.length,
    activeLocations: firstCount(activeLocations),
    activeStaffMemberships: firstCount(staff),
    activeMenuCategories: firstCount(activeCategories),
    activeMenuItems: firstCount(activeItems),
    activeOrders: firstCount(activeOrders),
    completedOrders: firstCount(completedOrders),
  };
}

export async function getCompanyOperationalReport(
  companyOrganizationId: string,
  range: ReportRange = "30d",
) {
  const childRestaurants = await getDb()
    .select({ id: organizations.id })
    .from(organizations)
    .where(
      and(
        eq(organizations.parentOrganizationId, companyOrganizationId),
        eq(organizations.type, "RESTAURANT"),
      ),
    );

  return getOperationalReportForOrganizations(
    childRestaurants.map((restaurant) => restaurant.id),
    range,
  );
}

export async function getCompanyRestaurantBreakdown(companyOrganizationId: string) {
  const db = getDb();
  const restaurants = await db
    .select()
    .from(organizations)
    .where(
      and(
        eq(organizations.parentOrganizationId, companyOrganizationId),
        eq(organizations.type, "RESTAURANT"),
      ),
    );

  return Promise.all(
    restaurants.map(async (restaurant) => {
      const [
        activeLocations,
        staff,
        activeOrders,
        completedOrders,
        cancelledOrders,
        lastOrder,
      ] = await Promise.all([
        db
          .select({ value: count() })
          .from(locations)
          .where(
            and(
              eq(locations.organizationId, restaurant.id),
              eq(locations.isActive, true),
            ),
          ),
        db
          .select({ value: count() })
          .from(memberships)
          .where(
            and(
              eq(memberships.organizationId, restaurant.id),
              eq(memberships.isActive, true),
            ),
          ),
        db
          .select({ value: count() })
          .from(orders)
          .where(
            and(
              eq(orders.organizationId, restaurant.id),
              inArray(orders.status, activeOrderStatuses),
            ),
          ),
        db
          .select({ value: count() })
          .from(orders)
          .where(
            and(
              eq(orders.organizationId, restaurant.id),
              ne(orders.status, "CANCELLED"),
            ),
          ),
        db
          .select({ value: count() })
          .from(orders)
          .where(
            and(
              eq(orders.organizationId, restaurant.id),
              eq(orders.status, "CANCELLED"),
            ),
          ),
        db
          .select({ createdAt: orders.createdAt })
          .from(orders)
          .where(eq(orders.organizationId, restaurant.id))
          .orderBy(desc(orders.createdAt))
          .limit(1),
      ]);

      return {
        id: restaurant.id,
        name: restaurant.name,
        slug: restaurant.slug,
        isActive: restaurant.isActive,
        activeLocations: firstCount(activeLocations),
        activeStaffMemberships: firstCount(staff),
        activeOrders: firstCount(activeOrders),
        completedOrders: firstCount(completedOrders),
        cancelledOrders: firstCount(cancelledOrders),
        lastOrderAt: firstDate(lastOrder),
      };
    }),
  );
}

export async function getRestaurantSummary(restaurantOrganizationId: string) {
  const db = getDb();
  const [
    activeLocations,
    staff,
    activeCategories,
    activeItems,
    activeOrders,
    completedOrders,
  ] = await Promise.all([
    db
      .select({ value: count() })
      .from(locations)
      .where(
        and(
          eq(locations.organizationId, restaurantOrganizationId),
          eq(locations.isActive, true),
        ),
      ),
    db
      .select({ value: count() })
      .from(memberships)
      .where(
        and(
          eq(memberships.organizationId, restaurantOrganizationId),
          eq(memberships.isActive, true),
        ),
      ),
    db
      .select({ value: count() })
      .from(menuCategories)
      .where(
        and(
          eq(menuCategories.organizationId, restaurantOrganizationId),
          eq(menuCategories.isActive, true),
        ),
      ),
    db
      .select({ value: count() })
      .from(menuItems)
      .where(
        and(
          eq(menuItems.organizationId, restaurantOrganizationId),
          eq(menuItems.isActive, true),
        ),
      ),
    db
      .select({ value: count() })
      .from(orders)
      .where(
        and(
          eq(orders.organizationId, restaurantOrganizationId),
          inArray(orders.status, activeOrderStatuses),
        ),
      ),
    db
      .select({ value: count() })
      .from(orders)
      .where(
        and(
          eq(orders.organizationId, restaurantOrganizationId),
          ne(orders.status, "CANCELLED"),
        ),
      ),
  ]);

  return {
    activeLocations: firstCount(activeLocations),
    activeStaffMemberships: firstCount(staff),
    activeMenuCategories: firstCount(activeCategories),
    activeMenuItems: firstCount(activeItems),
    activeOrders: firstCount(activeOrders),
    completedOrders: firstCount(completedOrders),
  };
}

export async function getRestaurantOperationalReport(
  restaurantOrganizationId: string,
  range: ReportRange = "30d",
) {
  return getOperationalReportForOrganizations([restaurantOrganizationId], range);
}

function csvCell(value: string | number | null) {
  const text = value == null ? "" : String(value);
  return `"${text.replaceAll('"', '""')}"`;
}

function csvRow(values: Array<string | number | null>) {
  return values.map(csvCell).join(",");
}

export function exportOperationalReportCsv(report: OperationalReport, title: string) {
  const rows: string[] = [
    csvRow(["Report", title]),
    csvRow(["Range", report.range]),
    "",
    csvRow(["Revenue"]),
    csvRow(["Gross revenue", "Priced lines", "Unpriced lines", "Average priced line"]),
    csvRow([
      report.revenue.grossRevenue.toFixed(2),
      report.revenue.pricedLines,
      report.revenue.unpricedLines,
      report.revenue.averagePricedLineValue?.toFixed(2) ?? "",
    ]),
    "",
    csvRow(["Timing"]),
    csvRow(["Prepared items", "Average prep minutes", "Delivered items", "Average collection minutes"]),
    csvRow([
      report.timing.preparedItems,
      report.timing.averagePrepMinutes?.toFixed(2) ?? "",
      report.timing.deliveredItems,
      report.timing.averageCollectionMinutes?.toFixed(2) ?? "",
    ]),
    "",
    csvRow(["Order status"]),
    csvRow(["Status", "Count", "Today count"]),
    ...report.statusBreakdown.map((row) =>
      csvRow([
        row.status,
        row.count,
        report.todayStatusBreakdown.find((today) => today.status === row.status)?.count ?? 0,
      ]),
    ),
    "",
    csvRow(["Top products"]),
    csvRow(["Product", "Category", "Quantity", "Order lines"]),
    ...report.topProducts.map((row) =>
      csvRow([row.drinkName, row.categoryName, row.quantity, row.orderLines]),
    ),
    "",
    csvRow(["Category mix"]),
    csvRow(["Category", "Quantity", "Order lines"]),
    ...report.categoryBreakdown.map((row) =>
      csvRow([row.categoryName, row.quantity, row.orderLines]),
    ),
    "",
    csvRow(["Staff activity"]),
    csvRow(["Staff", "Active orders", "Delivered orders", "Total orders"]),
    ...report.staffBreakdown.map((row) =>
      csvRow([row.staffName, row.activeOrders, row.deliveredOrders, row.totalOrders]),
    ),
    "",
    csvRow(["Location activity"]),
    csvRow(["Location", "Label", "Active", "Total", "Active orders", "Delivered", "Cancelled", "Last order"]),
    ...report.locationBreakdown.map((row) =>
      csvRow([
        row.name,
        row.label,
        row.isActive ? "Yes" : "No",
        row.totalOrders,
        row.activeOrders,
        row.deliveredOrders,
        row.cancelledOrders,
        row.lastOrderAt,
      ]),
    ),
    "",
    csvRow(["Cancelled items"]),
    csvRow(["Product", "Category", "Quantity", "Cancelled lines"]),
    ...report.cancelledItems.map((row) =>
      csvRow([row.drinkName, row.categoryName, row.quantity, row.cancelledLines]),
    ),
    "",
    csvRow(["Stock alerts"]),
    csvRow(["Product", "Current quantity", "Low stock threshold", "Unit", "Status"]),
    ...report.lowStock.map((row) =>
      csvRow([
        row.productName,
        row.currentQuantity,
        row.lowStockThreshold,
        row.unit,
        row.status,
      ]),
    ),
  ];

  return rows.join("\r\n");
}

async function listReportCompanies() {
  return getDb()
    .select()
    .from(organizations)
    .where(eq(organizations.type, "COMPANY"));
}
