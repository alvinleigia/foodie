import {
  sql,
} from "drizzle-orm";
import {
  boolean,
  AnyPgColumn,
  date,
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

export const userRoleEnum = pgEnum("user_role", ["ADMIN", "STAFF"]);

export const organizationTypeEnum = pgEnum("organization_type", [
  "PLATFORM",
  "COMPANY",
  "RESTAURANT",
]);

export const membershipRoleEnum = pgEnum("membership_role", [
  "PLATFORM_ADMIN",
  "COMPANY_OWNER",
  "COMPANY_MANAGER",
  "RESTAURANT_MANAGER",
  "ORDER_OPERATOR",
]);

export const userStatusEnum = pgEnum("user_status", [
  "INVITED",
  "ACTIVE",
  "DISABLED",
]);

export const orderStatusEnum = pgEnum("order_status", [
  "PENDING",
  "PREPARING",
  "READY",
  "DELIVERED",
  "CANCELLED",
]);

export const orderItemStatusEnum = pgEnum("order_item_status", [
  "PENDING",
  "PREPARING",
  "READY",
  "DELIVERED",
  "CANCELLED",
]);

export const cancelledByTypeEnum = pgEnum("cancelled_by_type", [
  "CUSTOMER",
  "STAFF",
  "ADMIN",
]);

export const subscriptionStatusEnum = pgEnum("subscription_status", [
  "TRIALING",
  "ACTIVE",
  "PAST_DUE",
  "SUSPENDED",
  "CANCELLED",
]);

export const tenantDomainScopeEnum = pgEnum("tenant_domain_scope", [
  "PLATFORM",
  "COMPANY",
  "RESTAURANT",
  "LOCATION",
]);

export const tenantDomainPurposeEnum = pgEnum("tenant_domain_purpose", [
  "ADMIN",
  "ORDERING",
  "BOTH",
]);

export const users = pgTable("users", {
  id: uuid("id").defaultRandom().primaryKey(),
  username: text("username").notNull().unique(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash"),
  role: userRoleEnum("role").notNull(),
  status: userStatusEnum("status").default("ACTIVE").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const organizations = pgTable(
  "organizations",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    parentOrganizationId: uuid("parent_organization_id").references(
      (): AnyPgColumn => organizations.id,
      { onDelete: "cascade" },
    ),
    type: organizationTypeEnum("type").notNull(),
    slug: text("slug").notNull(),
    name: text("name").notNull(),
    logoUrl: text("logo_url"),
    timezone: text("timezone").default("Asia/Calcutta").notNull(),
    currency: text("currency").default("INR").notNull(),
    isActive: boolean("is_active").default(true).notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    index("organizations_parent_idx").on(table.parentOrganizationId),
    uniqueIndex("organizations_slug_unique").on(table.slug),
  ],
);

export const saasPlans = pgTable(
  "saas_plans",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    slug: text("slug").notNull(),
    name: text("name").notNull(),
    monthlyPrice: numeric("monthly_price", { precision: 10, scale: 2 })
      .default("0")
      .notNull(),
    maxRestaurants: integer("max_restaurants").default(1).notNull(),
    maxLocations: integer("max_locations").default(1).notNull(),
    maxUsers: integer("max_users").default(5).notNull(),
    maxMonthlyOrders: integer("max_monthly_orders").default(500).notNull(),
    storageMb: integer("storage_mb").default(256).notNull(),
    isActive: boolean("is_active").default(true).notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [uniqueIndex("saas_plans_slug_unique").on(table.slug)],
);

export const organizationSubscriptions = pgTable(
  "organization_subscriptions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: uuid("organization_id")
      .references(() => organizations.id, { onDelete: "cascade" })
      .notNull(),
    planId: uuid("plan_id")
      .references(() => saasPlans.id)
      .notNull(),
    status: subscriptionStatusEnum("status").default("TRIALING").notNull(),
    trialEndsAt: timestamp("trial_ends_at"),
    currentPeriodEndsAt: timestamp("current_period_ends_at"),
    externalCustomerId: text("external_customer_id"),
    externalSubscriptionId: text("external_subscription_id"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("organization_subscriptions_org_unique").on(table.organizationId),
    index("organization_subscriptions_plan_idx").on(table.planId),
    index("organization_subscriptions_status_idx").on(table.status),
  ],
);

export const locations = pgTable(
  "locations",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: uuid("organization_id")
      .references(() => organizations.id, { onDelete: "cascade" })
      .notNull(),
    slug: text("slug").notNull(),
    qrSlug: text("qr_slug"),
    name: text("name").notNull(),
    label: text("label"),
    timezone: text("timezone").default("Asia/Calcutta").notNull(),
    isActive: boolean("is_active").default(true).notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    index("locations_organization_idx").on(table.organizationId),
    uniqueIndex("locations_org_slug_unique").on(table.organizationId, table.slug),
    uniqueIndex("locations_qr_slug_unique").on(table.qrSlug),
  ],
);

export const tenantDomains = pgTable(
  "tenant_domains",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    domain: text("domain").notNull(),
    scope: tenantDomainScopeEnum("scope").notNull(),
    purpose: tenantDomainPurposeEnum("purpose").default("BOTH").notNull(),
    companyOrganizationId: uuid("company_organization_id").references(
      () => organizations.id,
      { onDelete: "cascade" },
    ),
    restaurantOrganizationId: uuid("restaurant_organization_id").references(
      () => organizations.id,
      { onDelete: "cascade" },
    ),
    locationId: uuid("location_id").references(() => locations.id, {
      onDelete: "cascade",
    }),
    isPrimary: boolean("is_primary").default(false).notNull(),
    isActive: boolean("is_active").default(true).notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("tenant_domains_domain_unique").on(table.domain),
    index("tenant_domains_company_idx").on(table.companyOrganizationId),
    index("tenant_domains_restaurant_idx").on(table.restaurantOrganizationId),
    index("tenant_domains_location_idx").on(table.locationId),
    index("tenant_domains_scope_idx").on(table.scope),
  ],
);

export const auditLogs = pgTable(
  "audit_logs",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    actorUserId: uuid("actor_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    actorUsername: text("actor_username"),
    actorRole: membershipRoleEnum("actor_role"),
    organizationId: uuid("organization_id").references(() => organizations.id, {
      onDelete: "set null",
    }),
    locationId: uuid("location_id").references(() => locations.id, {
      onDelete: "set null",
    }),
    action: text("action").notNull(),
    entityType: text("entity_type").notNull(),
    entityId: text("entity_id"),
    metadata: jsonb("metadata").$type<Record<string, unknown>>(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    index("audit_logs_actor_user_idx").on(table.actorUserId),
    index("audit_logs_organization_idx").on(table.organizationId),
    index("audit_logs_location_idx").on(table.locationId),
    index("audit_logs_action_idx").on(table.action),
    index("audit_logs_created_at_idx").on(table.createdAt),
  ],
);

export const memberships = pgTable(
  "memberships",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .references(() => users.id, { onDelete: "cascade" })
      .notNull(),
    organizationId: uuid("organization_id")
      .references(() => organizations.id, { onDelete: "cascade" })
      .notNull(),
    locationId: uuid("location_id").references(() => locations.id, {
      onDelete: "cascade",
    }),
    role: membershipRoleEnum("role").notNull(),
    isActive: boolean("is_active").default(true).notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    index("memberships_organization_idx").on(table.organizationId),
    index("memberships_location_idx").on(table.locationId),
    uniqueIndex("memberships_user_org_location_unique").on(
      table.userId,
      table.organizationId,
      sql`coalesce(${table.locationId}, '00000000-0000-0000-0000-000000000000'::uuid)`,
    ),
  ],
);

export const staffInvitations = pgTable(
  "staff_invitations",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .references(() => users.id, { onDelete: "cascade" })
      .notNull(),
    membershipId: uuid("membership_id")
      .references(() => memberships.id, { onDelete: "cascade" })
      .notNull(),
    tokenHash: text("token_hash").notNull(),
    expiresAt: timestamp("expires_at").notNull(),
    acceptedAt: timestamp("accepted_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("staff_invitations_token_hash_unique").on(table.tokenHash),
    index("staff_invitations_user_idx").on(table.userId),
    index("staff_invitations_membership_idx").on(table.membershipId),
  ],
);

export const passwordResetTokens = pgTable(
  "password_reset_tokens",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .references(() => users.id, { onDelete: "cascade" })
      .notNull(),
    requestedByUserId: uuid("requested_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    tokenHash: text("token_hash").notNull(),
    expiresAt: timestamp("expires_at").notNull(),
    usedAt: timestamp("used_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("password_reset_tokens_token_hash_unique").on(table.tokenHash),
    index("password_reset_tokens_user_idx").on(table.userId),
    index("password_reset_tokens_requested_by_user_idx").on(table.requestedByUserId),
  ],
);

export const appState = pgTable("app_state", {
  key: text("key").primaryKey(),
  ordersResetAt: timestamp("orders_reset_at"),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const menuCategories = pgTable("menu_categories", {
  id: uuid("id").defaultRandom().primaryKey(),
  organizationId: uuid("organization_id")
    .references(() => organizations.id, { onDelete: "cascade" })
    .notNull(),
  locationId: uuid("location_id").references(() => locations.id, {
    onDelete: "cascade",
  }),
  slug: text("slug").notNull().unique(),
  name: text("name").notNull(),
  description: text("description"),
  sortOrder: integer("sort_order").default(0).notNull(),
  isActive: boolean("is_active").default(true).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const menuItems = pgTable("menu_items", {
  id: uuid("id").defaultRandom().primaryKey(),
  organizationId: uuid("organization_id")
    .references(() => organizations.id, { onDelete: "cascade" })
    .notNull(),
  locationId: uuid("location_id").references(() => locations.id, {
    onDelete: "cascade",
  }),
  categoryId: uuid("category_id")
    .references(() => menuCategories.id, { onDelete: "cascade" })
    .notNull(),
  slug: text("slug").notNull().unique(),
  name: text("name").notNull(),
  description: text("description"),
  price: numeric("price", { precision: 10, scale: 2 }),
  imageUrl: text("image_url"),
  sortOrder: integer("sort_order").default(0).notNull(),
  isActive: boolean("is_active").default(true).notNull(),
  isSoldOut: boolean("is_sold_out").default(false).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const menuTags = pgTable(
  "menu_tags",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    slug: text("slug").notNull(),
    name: text("name").notNull(),
    description: text("description"),
    color: text("color").default("stone").notNull(),
    sortOrder: integer("sort_order").default(0).notNull(),
    isActive: boolean("is_active").default(true).notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("menu_tags_slug_unique").on(table.slug),
    index("menu_tags_active_idx").on(table.isActive),
  ],
);

export const menuItemTags = pgTable(
  "menu_item_tags",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    menuItemId: uuid("menu_item_id")
      .references(() => menuItems.id, { onDelete: "cascade" })
      .notNull(),
    tagId: uuid("tag_id")
      .references(() => menuTags.id, { onDelete: "cascade" })
      .notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("menu_item_tags_item_tag_unique").on(table.menuItemId, table.tagId),
    index("menu_item_tags_item_idx").on(table.menuItemId),
    index("menu_item_tags_tag_idx").on(table.tagId),
  ],
);

export const inventoryItems = pgTable(
  "inventory_items",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: uuid("organization_id")
      .references(() => organizations.id, { onDelete: "cascade" })
      .notNull(),
    locationId: uuid("location_id")
      .references(() => locations.id, { onDelete: "cascade" })
      .notNull(),
    menuItemId: uuid("menu_item_id")
      .references(() => menuItems.id, { onDelete: "cascade" })
      .notNull(),
    unit: text("unit").default("servings").notNull(),
    currentQuantity: numeric("current_quantity", { precision: 10, scale: 2 })
      .default("0")
      .notNull(),
    lowStockThreshold: numeric("low_stock_threshold", { precision: 10, scale: 2 })
      .default("0")
      .notNull(),
    isTracked: boolean("is_tracked").default(true).notNull(),
    notes: text("notes"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    index("inventory_items_organization_idx").on(table.organizationId),
    index("inventory_items_location_idx").on(table.locationId),
    uniqueIndex("inventory_items_menu_item_unique").on(
      table.organizationId,
      table.locationId,
      table.menuItemId,
    ),
  ],
);

export const orders = pgTable("orders", {
  id: uuid("id").defaultRandom().primaryKey(),
  organizationId: uuid("organization_id")
    .references(() => organizations.id, { onDelete: "cascade" })
    .notNull(),
  locationId: uuid("location_id")
    .references(() => locations.id, { onDelete: "cascade" })
    .notNull(),
  orderDate: date("order_date").notNull(),
  orderNo: integer("order_no").notNull(),
  customerName: text("customer_name").notNull(),
  customerToken: text("customer_token").notNull(),
  categoryId: text("category_id").notNull(),
  categoryName: text("category_name").notNull(),
  drinkId: text("drink_id").notNull(),
  drinkName: text("drink_name").notNull(),
  status: orderStatusEnum("status").default("PENDING").notNull(),
  preparedById: uuid("prepared_by_id").references(() => users.id),
  startedAt: timestamp("started_at"),
  readyAt: timestamp("ready_at"),
  deliveredAt: timestamp("delivered_at"),
  cancelledAt: timestamp("cancelled_at"),
  cancelledByType: cancelledByTypeEnum("cancelled_by_type"),
  cancelledByUserId: uuid("cancelled_by_user_id").references(() => users.id),
  cancelReason: text("cancel_reason"),
  announcementCount: integer("announcement_count").default(0).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => [
  uniqueIndex("orders_location_order_date_no_unique").on(
    table.organizationId,
    table.locationId,
    table.orderDate,
    table.orderNo,
  ),
]);

export const orderItems = pgTable("order_items", {
  id: uuid("id").defaultRandom().primaryKey(),
  organizationId: uuid("organization_id")
    .references(() => organizations.id, { onDelete: "cascade" })
    .notNull(),
  locationId: uuid("location_id")
    .references(() => locations.id, { onDelete: "cascade" })
    .notNull(),
  orderId: uuid("order_id")
    .references(() => orders.id, { onDelete: "cascade" })
    .notNull(),
  categoryId: text("category_id").notNull(),
  categoryName: text("category_name").notNull(),
  drinkId: text("drink_id").notNull(),
  drinkName: text("drink_name").notNull(),
  quantity: integer("quantity").default(1).notNull(),
  notes: text("notes"),
  unitPrice: numeric("unit_price", { precision: 10, scale: 2 }),
  status: orderItemStatusEnum("status").default("PENDING").notNull(),
  startedAt: timestamp("started_at"),
  readyAt: timestamp("ready_at"),
  deliveredAt: timestamp("delivered_at"),
  cancelledAt: timestamp("cancelled_at"),
  inventoryReservedAt: timestamp("inventory_reserved_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});
