import {
  sql,
} from "drizzle-orm";
import {
  boolean,
  AnyPgColumn,
  check,
  date,
  foreignKey,
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
import type { StaffPermissionOverrides } from "@/lib/staff-permissions";

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
]);

export const tenantDomainPurposeEnum = pgEnum("tenant_domain_purpose", [
  "ADMIN",
  "ORDERING",
  "BOTH",
]);

export const modifierSelectionTypeEnum = pgEnum("modifier_selection_type", [
  "SINGLE",
  "MULTIPLE",
]);

export const orderingPointTypeEnum = pgEnum("ordering_point_type", [
  "GENERAL",
  "TABLE",
  "COUNTER",
]);

export const prepStationTypeEnum = pgEnum("prep_station_type", [
  "KITCHEN",
  "BAR",
  "OTHER",
]);

export const orderSourceEnum = pgEnum("order_source", [
  "CUSTOMER_SELF_SERVICE",
  "STAFF_CREATED",
]);

export const orderFulfilmentTypeEnum = pgEnum("order_fulfilment_type", [
  "DINE_IN",
  "TAKEAWAY",
  "COLLECTION",
  "DELIVERY",
]);

export const paymentStatusEnum = pgEnum("payment_status", [
  "NOT_REQUIRED",
  "UNPAID",
  "PARTIALLY_PAID",
  "PENDING",
  "PAID",
  "FAILED",
  "CANCELLED",
  "REFUND_PENDING",
  "PARTIALLY_REFUNDED",
  "REFUND_FAILED",
  "REFUNDED",
]);

export const refundStatusEnum = pgEnum("refund_status", [
  "PENDING",
  "SUCCEEDED",
  "FAILED",
]);

export const integrationModeEnum = pgEnum("integration_mode", [
  "INHERIT",
  "CUSTOM",
  "DISABLED",
]);

export const taxSystemEnum = pgEnum("tax_system", [
  "NONE",
  "VAT",
  "GST",
  "SALES_TAX",
  "OTHER",
]);

export const taxRegistrationStatusEnum = pgEnum("tax_registration_status", [
  "NOT_REGISTERED",
  "PENDING",
  "REGISTERED",
]);

export const taxPricingModeEnum = pgEnum("tax_pricing_mode", [
  "INCLUSIVE",
  "EXCLUSIVE",
]);

export const orderAdjustmentTypeEnum = pgEnum("order_adjustment_type", [
  "DISCOUNT",
  "COMP",
  "SERVICE_CHARGE",
  "TIP",
]);

export const orderAdjustmentScopeEnum = pgEnum("order_adjustment_scope", [
  "ORDER",
  "ITEM",
]);

export const orderAdjustmentCalculationEnum = pgEnum(
  "order_adjustment_calculation",
  ["FIXED_AMOUNT", "PERCENTAGE"],
);

export const orderAdjustmentEntryKindEnum = pgEnum(
  "order_adjustment_entry_kind",
  ["APPLY", "REVERSAL"],
);

export const orderAdjustmentActorTypeEnum = pgEnum(
  "order_adjustment_actor_type",
  ["CUSTOMER", "STAFF", "SYSTEM"],
);

export const financialDocumentTypeEnum = pgEnum("financial_document_type", [
  "RECEIPT",
  "INVOICE",
]);

export const vatInvoiceTypeEnum = pgEnum("vat_invoice_type", [
  "SIMPLIFIED",
  "FULL",
]);

export const emailProviderEnum = pgEnum("email_provider", ["SMTP2GO"]);

export const integrationVerificationStatusEnum = pgEnum(
  "integration_verification_status",
  ["NOT_CONFIGURED", "PENDING", "VERIFIED", "FAILED"],
);

export const paymentProviderEnum = pgEnum("payment_provider", [
  "STRIPE",
  "CASH",
]);

export const orderPaymentMethodEnum = pgEnum("order_payment_method", [
  "CASH",
  "STRIPE_CHECKOUT",
]);

export const orderPaymentRecordStatusEnum = pgEnum(
  "order_payment_record_status",
  ["PENDING", "SUCCEEDED", "FAILED", "CANCELLED"],
);

export const cashDrawerSessionStatusEnum = pgEnum(
  "cash_drawer_session_status",
  ["OPEN", "CLOSED"],
);

export const cashDrawerMovementTypeEnum = pgEnum(
  "cash_drawer_movement_type",
  ["PAID_IN", "PAID_OUT"],
);

export const socialAuthProviderEnum = pgEnum("social_auth_provider", [
  "GOOGLE",
  "APPLE",
  "FACEBOOK",
]);

export const paymentOnboardingStatusEnum = pgEnum("payment_onboarding_status", [
  "NOT_STARTED",
  "PENDING",
  "COMPLETE",
  "RESTRICTED",
]);

export const deploymentCells = pgTable(
  "deployment_cells",
  {
    id: integer("id").primaryKey(),
    cellId: text("cell_id").notNull(),
    region: text("region").notNull(),
    rootDomain: text("root_domain").notNull(),
    defaultLocale: text("default_locale").notNull(),
    defaultTimezone: text("default_timezone").notNull(),
    defaultCurrency: text("default_currency").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("deployment_cells_cell_id_unique").on(table.cellId),
    check("deployment_cells_singleton_check", sql`${table.id} = 1`),
  ],
);

export const users = pgTable("users", {
  id: uuid("id").defaultRandom().primaryKey(),
  username: text("username").notNull().unique(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash"),
  sessionVersion: integer("session_version").default(1).notNull(),
  role: userRoleEnum("role").notNull(),
  status: userStatusEnum("status").default("ACTIVE").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const customers = pgTable(
  "customers",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    name: text("name").notNull(),
    email: text("email").notNull(),
    emailVerifiedAt: timestamp("email_verified_at"),
    phone: text("phone"),
    phoneVerifiedAt: timestamp("phone_verified_at"),
    dateOfBirth: date("date_of_birth"),
    gender: text("gender"),
    marketingOptIn: boolean("marketing_opt_in").default(false).notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("customers_email_unique").on(sql`lower(${table.email})`),
    index("customers_phone_idx").on(table.phone),
  ],
);

export const customerOAuthAccounts = pgTable(
  "customer_oauth_accounts",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    customerId: uuid("customer_id")
      .references(() => customers.id, { onDelete: "cascade" })
      .notNull(),
    provider: text("provider").notNull(),
    providerAccountId: text("provider_account_id").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    index("customer_oauth_accounts_customer_idx").on(table.customerId),
    uniqueIndex("customer_oauth_accounts_provider_account_unique").on(
      table.provider,
      table.providerAccountId,
    ),
  ],
);

export const customerEmailOtps = pgTable(
  "customer_email_otps",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    email: text("email").notNull(),
    codeHash: text("code_hash").notNull(),
    attempts: integer("attempts").default(0).notNull(),
    expiresAt: timestamp("expires_at").notNull(),
    consumedAt: timestamp("consumed_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    index("customer_email_otps_email_created_idx").on(table.email, table.createdAt),
    index("customer_email_otps_expires_idx").on(table.expiresAt),
  ],
);

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
    timezone: text("timezone").notNull(),
    currency: text("currency").notNull(),
    customerCancellationFeeBps: integer("customer_cancellation_fee_bps")
      .default(0)
      .notNull(),
    isActive: boolean("is_active").default(true).notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    index("organizations_parent_idx").on(table.parentOrganizationId),
    uniqueIndex("organizations_slug_unique").on(table.slug),
    check(
      "organizations_customer_cancellation_fee_bps_check",
      sql`${table.customerCancellationFeeBps} >= 0 AND ${table.customerCancellationFeeBps} <= 10000`,
    ),
  ],
);

export const organizationCustomers = pgTable(
  "organization_customers",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: uuid("organization_id")
      .references(() => organizations.id, { onDelete: "cascade" })
      .notNull(),
    customerId: uuid("customer_id")
      .references(() => customers.id, { onDelete: "cascade" })
      .notNull(),
    name: text("name").notNull(),
    phone: text("phone"),
    phoneVerifiedAt: timestamp("phone_verified_at"),
    dateOfBirth: date("date_of_birth"),
    gender: text("gender"),
    marketingOptIn: boolean("marketing_opt_in").default(false).notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("organization_customers_org_customer_unique").on(
      table.organizationId,
      table.customerId,
    ),
    index("organization_customers_org_name_idx").on(
      table.organizationId,
      table.name,
    ),
    index("organization_customers_phone_idx").on(table.phone),
  ],
);

export const customerAuthHandoffs = pgTable(
  "customer_auth_handoffs",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    customerId: uuid("customer_id")
      .references(() => customers.id, { onDelete: "cascade" })
      .notNull(),
    organizationId: uuid("organization_id")
      .references(() => organizations.id, { onDelete: "cascade" })
      .notNull(),
    tokenHash: text("token_hash").notNull(),
    destinationOrigin: text("destination_origin").notNull(),
    returnTo: text("return_to").notNull(),
    expiresAt: timestamp("expires_at").notNull(),
    consumedAt: timestamp("consumed_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("customer_auth_handoffs_token_hash_unique").on(table.tokenHash),
    index("customer_auth_handoffs_customer_idx").on(table.customerId),
    index("customer_auth_handoffs_expires_idx").on(table.expiresAt),
  ],
);

export const organizationEmailSettings = pgTable(
  "organization_email_settings",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: uuid("organization_id")
      .references(() => organizations.id, { onDelete: "cascade" })
      .notNull(),
    mode: integrationModeEnum("mode").default("INHERIT").notNull(),
    provider: emailProviderEnum("provider").default("SMTP2GO").notNull(),
    fromName: text("from_name"),
    fromEmail: text("from_email"),
    replyToEmail: text("reply_to_email"),
    apiKeyEncrypted: text("api_key_encrypted"),
    apiKeyHint: text("api_key_hint"),
    verificationStatus: integrationVerificationStatusEnum("verification_status")
      .default("NOT_CONFIGURED")
      .notNull(),
    lastTestedAt: timestamp("last_tested_at"),
    updatedByUserId: uuid("updated_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("organization_email_settings_org_unique").on(table.organizationId),
    index("organization_email_settings_mode_idx").on(table.mode),
  ],
);

export const organizationPaymentAccounts = pgTable(
  "organization_payment_accounts",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: uuid("organization_id")
      .references(() => organizations.id, { onDelete: "cascade" })
      .notNull(),
    mode: integrationModeEnum("mode").default("INHERIT").notNull(),
    provider: paymentProviderEnum("provider").default("STRIPE").notNull(),
    stripeAccountId: text("stripe_account_id"),
    onboardingStatus: paymentOnboardingStatusEnum("onboarding_status")
      .default("NOT_STARTED")
      .notNull(),
    chargesEnabled: boolean("charges_enabled").default(false).notNull(),
    payoutsEnabled: boolean("payouts_enabled").default(false).notNull(),
    detailsSubmitted: boolean("details_submitted").default(false).notNull(),
    applicationFeeBps: integer("application_fee_bps").default(0).notNull(),
    lastSyncedAt: timestamp("last_synced_at"),
    updatedByUserId: uuid("updated_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("organization_payment_accounts_org_unique").on(table.organizationId),
    uniqueIndex("organization_payment_accounts_stripe_unique").on(table.stripeAccountId),
    index("organization_payment_accounts_mode_idx").on(table.mode),
    check(
      "organization_payment_accounts_fee_bps_check",
      sql`${table.applicationFeeBps} >= 0 AND ${table.applicationFeeBps} <= 10000`,
    ),
  ],
);

export const organizationOAuthSettings = pgTable(
  "organization_oauth_settings",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: uuid("organization_id")
      .references(() => organizations.id, { onDelete: "cascade" })
      .notNull(),
    provider: socialAuthProviderEnum("provider").notNull(),
    mode: integrationModeEnum("mode").default("INHERIT").notNull(),
    clientId: text("client_id"),
    clientSecretEncrypted: text("client_secret_encrypted"),
    clientSecretHint: text("client_secret_hint"),
    updatedByUserId: uuid("updated_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("organization_oauth_settings_org_provider_unique").on(
      table.organizationId,
      table.provider,
    ),
    index("organization_oauth_settings_mode_idx").on(table.mode),
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
    maxUsers: integer("max_users").default(5).notNull(),
    maxMonthlyOrders: integer("max_monthly_orders").default(500).notNull(),
    storageMb: integer("storage_mb").default(256).notNull(),
    isActive: boolean("is_active").default(true).notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [uniqueIndex("saas_plans_slug_unique").on(table.slug)],
);

export const restaurantDocumentCounters = pgTable(
  "restaurant_document_counters",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: uuid("organization_id")
      .references(() => organizations.id, { onDelete: "cascade" })
      .notNull(),
    documentType: financialDocumentTypeEnum("document_type").notNull(),
    lastNumber: integer("last_number").default(0).notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("restaurant_document_counters_org_type_unique").on(
      table.organizationId,
      table.documentType,
    ),
    check(
      "restaurant_document_counters_last_number_check",
      sql`${table.lastNumber} >= 0`,
    ),
  ],
);

export const organizationTaxProfiles = pgTable(
  "organization_tax_profiles",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: uuid("organization_id")
      .references(() => organizations.id, { onDelete: "cascade" })
      .notNull(),
    taxSystem: taxSystemEnum("tax_system").default("NONE").notNull(),
    pricingMode: taxPricingModeEnum("pricing_mode")
      .default("INCLUSIVE")
      .notNull(),
    registrationStatus: taxRegistrationStatusEnum("registration_status")
      .default("NOT_REGISTERED")
      .notNull(),
    registrationNumber: text("registration_number"),
    legalName: text("legal_name"),
    addressLine1: text("address_line_1"),
    addressLine2: text("address_line_2"),
    city: text("city"),
    region: text("region"),
    postalCode: text("postal_code"),
    countryCode: text("country_code"),
    defaultTaxRateBps: integer("default_tax_rate_bps").default(0).notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("organization_tax_profiles_org_unique").on(
      table.organizationId,
    ),
    index("organization_tax_profiles_status_idx").on(
      table.registrationStatus,
    ),
    check(
      "organization_tax_profiles_rate_check",
      sql`${table.defaultTaxRateBps} >= 0 AND ${table.defaultTaxRateBps} <= 10000`,
    ),
    check(
      "organization_tax_profiles_country_check",
      sql`${table.countryCode} IS NULL OR ${table.countryCode} ~ '^[A-Z]{2}$'`,
    ),
    check(
      "organization_tax_profiles_none_check",
      sql`${table.taxSystem} <> 'NONE' OR (${table.registrationStatus} = 'NOT_REGISTERED' AND ${table.defaultTaxRateBps} = 0)`,
    ),
    check(
      "organization_tax_profiles_none_pricing_mode_check",
      sql`${table.taxSystem} <> 'NONE' OR ${table.pricingMode} = 'INCLUSIVE'`,
    ),
    check(
      "organization_tax_profiles_registered_check",
      sql`${table.registrationStatus} <> 'REGISTERED' OR (
        ${table.taxSystem} <> 'NONE'
        AND NULLIF(BTRIM(${table.registrationNumber}), '') IS NOT NULL
        AND NULLIF(BTRIM(${table.legalName}), '') IS NOT NULL
        AND NULLIF(BTRIM(${table.addressLine1}), '') IS NOT NULL
        AND NULLIF(BTRIM(${table.city}), '') IS NOT NULL
        AND NULLIF(BTRIM(${table.postalCode}), '') IS NOT NULL
        AND NULLIF(BTRIM(${table.countryCode}), '') IS NOT NULL
      )`,
    ),
  ],
);

export const saasFeatures = pgTable(
  "saas_features",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    key: text("key").notNull(),
    name: text("name").notNull(),
    description: text("description"),
    category: text("category").notNull(),
    defaultEnabled: boolean("default_enabled").default(false).notNull(),
    isActive: boolean("is_active").default(true).notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("saas_features_key_unique").on(table.key),
    index("saas_features_category_idx").on(table.category),
  ],
);

export const saasPlanFeatures = pgTable(
  "saas_plan_features",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    planId: uuid("plan_id")
      .references(() => saasPlans.id, { onDelete: "cascade" })
      .notNull(),
    featureId: uuid("feature_id")
      .references(() => saasFeatures.id, { onDelete: "cascade" })
      .notNull(),
    enabled: boolean("enabled").default(true).notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("saas_plan_features_plan_feature_unique").on(
      table.planId,
      table.featureId,
    ),
    index("saas_plan_features_feature_idx").on(table.featureId),
  ],
);

export const organizationFeatureOverrides = pgTable(
  "organization_feature_overrides",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: uuid("organization_id")
      .references(() => organizations.id, { onDelete: "cascade" })
      .notNull(),
    featureId: uuid("feature_id")
      .references(() => saasFeatures.id, { onDelete: "cascade" })
      .notNull(),
    enabled: boolean("enabled").notNull(),
    reason: text("reason"),
    expiresAt: timestamp("expires_at"),
    updatedByUserId: uuid("updated_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("organization_feature_overrides_org_feature_unique").on(
      table.organizationId,
      table.featureId,
    ),
    index("organization_feature_overrides_feature_idx").on(table.featureId),
    index("organization_feature_overrides_expires_idx").on(table.expiresAt),
  ],
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

export const orderingPoints = pgTable(
  "ordering_points",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: uuid("organization_id")
      .references(() => organizations.id, { onDelete: "cascade" })
      .notNull(),
    slug: text("slug").notNull(),
    qrSlug: text("qr_slug"),
    name: text("name").notNull(),
    label: text("label"),
    type: orderingPointTypeEnum("type").default("GENERAL").notNull(),
    isDefault: boolean("is_default").default(false).notNull(),
    isActive: boolean("is_active").default(true).notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    index("ordering_points_organization_idx").on(table.organizationId),
    uniqueIndex("ordering_points_org_slug_unique").on(
      table.organizationId,
      table.slug,
    ),
    uniqueIndex("ordering_points_qr_slug_unique").on(table.qrSlug),
    uniqueIndex("ordering_points_org_default_unique")
      .on(table.organizationId)
      .where(sql`${table.isDefault} = true`),
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
    isPrimary: boolean("is_primary").default(false).notNull(),
    isActive: boolean("is_active").default(true).notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("tenant_domains_domain_unique").on(table.domain),
    index("tenant_domains_company_idx").on(table.companyOrganizationId),
    index("tenant_domains_restaurant_idx").on(table.restaurantOrganizationId),
    index("tenant_domains_scope_idx").on(table.scope),
    uniqueIndex("tenant_domains_company_primary_unique")
      .on(table.companyOrganizationId)
      .where(sql`${table.scope} = 'COMPANY' AND ${table.isPrimary} = true`),
    uniqueIndex("tenant_domains_restaurant_primary_unique")
      .on(table.restaurantOrganizationId)
      .where(sql`${table.scope} = 'RESTAURANT' AND ${table.isPrimary} = true`),
    check(
      "tenant_domains_owner_scope_check",
      sql`(
        (${table.scope} = 'PLATFORM' AND ${table.companyOrganizationId} IS NULL AND ${table.restaurantOrganizationId} IS NULL)
        OR (${table.scope} = 'COMPANY' AND ${table.companyOrganizationId} IS NOT NULL AND ${table.restaurantOrganizationId} IS NULL AND ${table.purpose} = 'ORDERING')
        OR (${table.scope} = 'RESTAURANT' AND ${table.companyOrganizationId} IS NOT NULL AND ${table.restaurantOrganizationId} IS NOT NULL AND ${table.purpose} = 'ORDERING')
      )`,
    ),
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
    action: text("action").notNull(),
    entityType: text("entity_type").notNull(),
    entityId: text("entity_id"),
    metadata: jsonb("metadata").$type<Record<string, unknown>>(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    index("audit_logs_actor_user_idx").on(table.actorUserId),
    index("audit_logs_organization_idx").on(table.organizationId),
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
    role: membershipRoleEnum("role").notNull(),
    permissionOverrides: jsonb("permission_overrides")
      .$type<StaffPermissionOverrides>()
      .default({})
      .notNull(),
    isActive: boolean("is_active").default(true).notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    index("memberships_organization_idx").on(table.organizationId),
    uniqueIndex("memberships_user_org_unique").on(
      table.userId,
      table.organizationId,
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

export const cashDrawerSessions = pgTable(
  "cash_drawer_sessions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: uuid("organization_id")
      .references(() => organizations.id, { onDelete: "cascade" })
      .notNull(),
    orderingPointId: uuid("ordering_point_id")
      .references(() => orderingPoints.id, { onDelete: "restrict" })
      .notNull(),
    openedByMembershipId: uuid("opened_by_membership_id").references(
      () => memberships.id,
      { onDelete: "set null" },
    ),
    openedByUserId: uuid("opened_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    openingFloat: numeric("opening_float", { precision: 10, scale: 2 })
      .default("0")
      .notNull(),
    currency: text("currency").notNull(),
    status: cashDrawerSessionStatusEnum("status").default("OPEN").notNull(),
    openedAt: timestamp("opened_at").defaultNow().notNull(),
    closedAt: timestamp("closed_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    index("cash_drawer_sessions_organization_status_idx").on(
      table.organizationId,
      table.status,
    ),
    index("cash_drawer_sessions_ordering_point_opened_idx").on(
      table.orderingPointId,
      table.openedAt,
    ),
    uniqueIndex("cash_drawer_sessions_id_organization_unique").on(
      table.id,
      table.organizationId,
    ),
    uniqueIndex("cash_drawer_sessions_ordering_point_open_unique")
      .on(table.orderingPointId)
      .where(sql`${table.status} = 'OPEN'`),
    check(
      "cash_drawer_sessions_opening_float_check",
      sql`${table.openingFloat} >= 0`,
    ),
    check(
      "cash_drawer_sessions_closed_at_check",
      sql`(${table.status} = 'OPEN' AND ${table.closedAt} IS NULL) OR (${table.status} = 'CLOSED' AND ${table.closedAt} IS NOT NULL)`,
    ),
  ],
);

export const cashDrawerMovements = pgTable(
  "cash_drawer_movements",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: uuid("organization_id")
      .references(() => organizations.id, { onDelete: "cascade" })
      .notNull(),
    cashDrawerSessionId: uuid("cash_drawer_session_id").notNull(),
    type: cashDrawerMovementTypeEnum("type").notNull(),
    amount: numeric("amount", { precision: 10, scale: 2 }).notNull(),
    currency: text("currency").notNull(),
    reason: text("reason").notNull(),
    note: text("note"),
    recordedByMembershipId: uuid("recorded_by_membership_id").references(
      () => memberships.id,
      { onDelete: "set null" },
    ),
    recordedByUserId: uuid("recorded_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    foreignKey({
      columns: [table.cashDrawerSessionId, table.organizationId],
      foreignColumns: [cashDrawerSessions.id, cashDrawerSessions.organizationId],
      name: "cash_drawer_movements_session_organization_fk",
    }).onDelete("cascade"),
    index("cash_drawer_movements_organization_created_idx").on(
      table.organizationId,
      table.createdAt,
    ),
    index("cash_drawer_movements_session_created_idx").on(
      table.cashDrawerSessionId,
      table.createdAt,
    ),
    check("cash_drawer_movements_amount_check", sql`${table.amount} > 0`),
    check(
      "cash_drawer_movements_reason_check",
      sql`char_length(btrim(${table.reason})) BETWEEN 1 AND 120`,
    ),
    check(
      "cash_drawer_movements_note_check",
      sql`${table.note} IS NULL OR char_length(${table.note}) <= 500`,
    ),
  ],
);

export const cashDrawerReconciliations = pgTable(
  "cash_drawer_reconciliations",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: uuid("organization_id")
      .references(() => organizations.id, { onDelete: "cascade" })
      .notNull(),
    cashDrawerSessionId: uuid("cash_drawer_session_id").notNull(),
    currency: text("currency").notNull(),
    openingFloat: numeric("opening_float", { precision: 10, scale: 2 })
      .notNull(),
    cashSalesAmount: numeric("cash_sales_amount", {
      precision: 10,
      scale: 2,
    }).notNull(),
    cashRefundsAmount: numeric("cash_refunds_amount", {
      precision: 10,
      scale: 2,
    }).notNull(),
    paidInAmount: numeric("paid_in_amount", {
      precision: 10,
      scale: 2,
    }).notNull(),
    paidOutAmount: numeric("paid_out_amount", {
      precision: 10,
      scale: 2,
    }).notNull(),
    expectedCashAmount: numeric("expected_cash_amount", {
      precision: 10,
      scale: 2,
    }).notNull(),
    countedCashAmount: numeric("counted_cash_amount", {
      precision: 10,
      scale: 2,
    }).notNull(),
    varianceAmount: numeric("variance_amount", {
      precision: 10,
      scale: 2,
    }).notNull(),
    closingNote: text("closing_note"),
    closedByMembershipId: uuid("closed_by_membership_id").references(
      () => memberships.id,
      { onDelete: "set null" },
    ),
    closedByUserId: uuid("closed_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    foreignKey({
      columns: [table.cashDrawerSessionId, table.organizationId],
      foreignColumns: [cashDrawerSessions.id, cashDrawerSessions.organizationId],
      name: "cash_drawer_reconciliations_session_organization_fk",
    }).onDelete("cascade"),
    uniqueIndex("cash_drawer_reconciliations_session_unique").on(
      table.cashDrawerSessionId,
    ),
    index("cash_drawer_reconciliations_organization_created_idx").on(
      table.organizationId,
      table.createdAt,
    ),
    check(
      "cash_drawer_reconciliations_nonnegative_amounts_check",
      sql`${table.openingFloat} >= 0 AND ${table.cashSalesAmount} >= 0 AND ${table.cashRefundsAmount} >= 0 AND ${table.paidInAmount} >= 0 AND ${table.paidOutAmount} >= 0 AND ${table.expectedCashAmount} >= 0 AND ${table.countedCashAmount} >= 0`,
    ),
    check(
      "cash_drawer_reconciliations_expected_cash_check",
      sql`${table.expectedCashAmount} = ${table.openingFloat} + ${table.cashSalesAmount} + ${table.paidInAmount} - ${table.cashRefundsAmount} - ${table.paidOutAmount}`,
    ),
    check(
      "cash_drawer_reconciliations_variance_check",
      sql`${table.varianceAmount} = ${table.countedCashAmount} - ${table.expectedCashAmount}`,
    ),
    check(
      "cash_drawer_reconciliations_closing_note_check",
      sql`${table.closingNote} IS NULL OR char_length(${table.closingNote}) <= 500`,
    ),
  ],
);

export const menuCategories = pgTable("menu_categories", {
  id: uuid("id").defaultRandom().primaryKey(),
  organizationId: uuid("organization_id")
    .references(() => organizations.id, { onDelete: "cascade" })
    .notNull(),
  slug: text("slug").notNull(),
  name: text("name").notNull(),
  description: text("description"),
  sortOrder: integer("sort_order").default(0).notNull(),
  isActive: boolean("is_active").default(true).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => [
  index("menu_categories_organization_idx").on(table.organizationId),
  uniqueIndex("menu_categories_org_slug_unique").on(
    table.organizationId,
    table.slug,
  ),
]);

export const prepStations = pgTable(
  "prep_stations",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: uuid("organization_id")
      .references(() => organizations.id, { onDelete: "cascade" })
      .notNull(),
    slug: text("slug").notNull(),
    name: text("name").notNull(),
    type: prepStationTypeEnum("type").default("OTHER").notNull(),
    sortOrder: integer("sort_order").default(0).notNull(),
    isActive: boolean("is_active").default(true).notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("prep_stations_id_organization_unique").on(
      table.id,
      table.organizationId,
    ),
    uniqueIndex("prep_stations_organization_slug_unique").on(
      table.organizationId,
      table.slug,
    ),
    index("prep_stations_organization_active_idx").on(
      table.organizationId,
      table.isActive,
      table.sortOrder,
    ),
    check(
      "prep_stations_name_check",
      sql`char_length(btrim(${table.name})) BETWEEN 1 AND 80`,
    ),
    check(
      "prep_stations_slug_check",
      sql`${table.slug} ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'`,
    ),
  ],
);

export const menuItems = pgTable("menu_items", {
  id: uuid("id").defaultRandom().primaryKey(),
  organizationId: uuid("organization_id")
    .references(() => organizations.id, { onDelete: "cascade" })
    .notNull(),
  categoryId: uuid("category_id")
    .references(() => menuCategories.id, { onDelete: "cascade" })
    .notNull(),
  prepStationId: uuid("prep_station_id"),
  slug: text("slug").notNull(),
  name: text("name").notNull(),
  description: text("description"),
  price: numeric("price", { precision: 10, scale: 2 }),
  imageUrl: text("image_url"),
  sortOrder: integer("sort_order").default(0).notNull(),
  isActive: boolean("is_active").default(true).notNull(),
  isSoldOut: boolean("is_sold_out").default(false).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => [
  index("menu_items_organization_idx").on(table.organizationId),
  index("menu_items_prep_station_idx").on(
    table.organizationId,
    table.prepStationId,
  ),
  foreignKey({
    columns: [table.prepStationId, table.organizationId],
    foreignColumns: [prepStations.id, prepStations.organizationId],
    name: "menu_items_prep_station_organization_fk",
  }).onDelete("restrict"),
  uniqueIndex("menu_items_org_slug_unique").on(
    table.organizationId,
    table.slug,
  ),
]);

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

export const modifierGroups = pgTable(
  "modifier_groups",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: uuid("organization_id")
      .references(() => organizations.id, { onDelete: "cascade" })
      .notNull(),
    slug: text("slug").notNull(),
    name: text("name").notNull(),
    description: text("description"),
    selectionType: modifierSelectionTypeEnum("selection_type")
      .default("MULTIPLE")
      .notNull(),
    isRequired: boolean("is_required").default(false).notNull(),
    minSelections: integer("min_selections").default(0).notNull(),
    maxSelections: integer("max_selections"),
    sortOrder: integer("sort_order").default(0).notNull(),
    isActive: boolean("is_active").default(true).notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    index("modifier_groups_organization_idx").on(table.organizationId),
    uniqueIndex("modifier_groups_org_slug_unique").on(
      table.organizationId,
      table.slug,
    ),
  ],
);

export const modifierOptions = pgTable(
  "modifier_options",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: uuid("organization_id")
      .references(() => organizations.id, { onDelete: "cascade" })
      .notNull(),
    groupId: uuid("group_id")
      .references(() => modifierGroups.id, { onDelete: "cascade" })
      .notNull(),
    slug: text("slug").notNull(),
    name: text("name").notNull(),
    priceDelta: numeric("price_delta", { precision: 10, scale: 2 })
      .default("0")
      .notNull(),
    sortOrder: integer("sort_order").default(0).notNull(),
    isActive: boolean("is_active").default(true).notNull(),
    isSoldOut: boolean("is_sold_out").default(false).notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    index("modifier_options_group_idx").on(table.groupId),
    uniqueIndex("modifier_options_group_slug_unique").on(table.groupId, table.slug),
  ],
);

export const menuItemModifierGroups = pgTable(
  "menu_item_modifier_groups",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    menuItemId: uuid("menu_item_id")
      .references(() => menuItems.id, { onDelete: "cascade" })
      .notNull(),
    modifierGroupId: uuid("modifier_group_id")
      .references(() => modifierGroups.id, { onDelete: "cascade" })
      .notNull(),
    sortOrder: integer("sort_order").default(0).notNull(),
    isActive: boolean("is_active").default(true).notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("menu_item_modifier_groups_unique").on(
      table.menuItemId,
      table.modifierGroupId,
    ),
    index("menu_item_modifier_groups_item_idx").on(table.menuItemId),
    index("menu_item_modifier_groups_group_idx").on(table.modifierGroupId),
  ],
);

export const inventoryItems = pgTable(
  "inventory_items",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: uuid("organization_id")
      .references(() => organizations.id, { onDelete: "cascade" })
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
    uniqueIndex("inventory_items_org_menu_item_unique").on(
      table.organizationId,
      table.menuItemId,
    ),
  ],
);

export const orders = pgTable("orders", {
  id: uuid("id").defaultRandom().primaryKey(),
  organizationId: uuid("organization_id")
    .references(() => organizations.id, { onDelete: "cascade" })
    .notNull(),
  orderingPointId: uuid("ordering_point_id").references(() => orderingPoints.id, {
    onDelete: "set null",
  }),
  orderDate: date("order_date").notNull(),
  orderNo: integer("order_no").notNull(),
  customerName: text("customer_name").notNull(),
  customerToken: text("customer_token").notNull(),
  customerId: uuid("customer_id").references(() => customers.id, {
    onDelete: "set null",
  }),
  organizationCustomerId: uuid("organization_customer_id").references(
    () => organizationCustomers.id,
    { onDelete: "set null" },
  ),
  createdByUserId: uuid("created_by_user_id").references(() => users.id, {
    onDelete: "set null",
  }),
  source: orderSourceEnum("source").default("CUSTOMER_SELF_SERVICE").notNull(),
  fulfilmentType: orderFulfilmentTypeEnum("fulfilment_type")
    .default("COLLECTION")
    .notNull(),
  requestedFulfilmentAt: timestamp("requested_fulfilment_at"),
  promisedFulfilmentAt: timestamp("promised_fulfilment_at"),
  paymentStatus: paymentStatusEnum("payment_status")
    .default("NOT_REQUIRED")
    .notNull(),
  paymentAmount: numeric("payment_amount", { precision: 10, scale: 2 }),
  paymentCollectedAmount: numeric("payment_collected_amount", {
    precision: 10,
    scale: 2,
  })
    .default("0")
    .notNull(),
  paymentCurrency: text("payment_currency"),
  subtotalAmountSnapshot: numeric("subtotal_amount_snapshot", {
    precision: 10,
    scale: 2,
  }),
  discountAmountSnapshot: numeric("discount_amount_snapshot", {
    precision: 10,
    scale: 2,
  }),
  taxAmountSnapshot: numeric("tax_amount_snapshot", {
    precision: 10,
    scale: 2,
  }),
  chargeAmountSnapshot: numeric("charge_amount_snapshot", {
    precision: 10,
    scale: 2,
  }),
  tipAmountSnapshot: numeric("tip_amount_snapshot", {
    precision: 10,
    scale: 2,
  }),
  finalTotalAmountSnapshot: numeric("final_total_amount_snapshot", {
    precision: 10,
    scale: 2,
  }),
  financialSnapshotCurrency: text("financial_snapshot_currency"),
  financialSnapshotAt: timestamp("financial_snapshot_at"),
  paymentAccountOrganizationId: uuid("payment_account_organization_id").references(
    () => organizations.id,
    { onDelete: "set null" },
  ),
  stripeConnectedAccountId: text("stripe_connected_account_id"),
  stripeCheckoutSessionId: text("stripe_checkout_session_id"),
  stripePaymentIntentId: text("stripe_payment_intent_id"),
  paymentExpiresAt: timestamp("payment_expires_at"),
  paidAt: timestamp("paid_at"),
  receiptNumber: integer("receipt_number"),
  receiptIssuedAt: timestamp("receipt_issued_at"),
  invoiceNumber: integer("invoice_number"),
  invoiceIssuedAt: timestamp("invoice_issued_at"),
  vatInvoiceType: vatInvoiceTypeEnum("vat_invoice_type"),
  invoiceTaxPointAt: timestamp("invoice_tax_point_at"),
  invoiceSupplierName: text("invoice_supplier_name"),
  invoiceSupplierAddressLine1: text("invoice_supplier_address_line_1"),
  invoiceSupplierAddressLine2: text("invoice_supplier_address_line_2"),
  invoiceSupplierCity: text("invoice_supplier_city"),
  invoiceSupplierRegion: text("invoice_supplier_region"),
  invoiceSupplierPostalCode: text("invoice_supplier_postal_code"),
  invoiceSupplierCountryCode: text("invoice_supplier_country_code"),
  invoiceSupplierVatNumber: text("invoice_supplier_vat_number"),
  invoiceCustomerName: text("invoice_customer_name"),
  invoiceCustomerAddressLine1: text("invoice_customer_address_line_1"),
  invoiceCustomerAddressLine2: text("invoice_customer_address_line_2"),
  invoiceCustomerCity: text("invoice_customer_city"),
  invoiceCustomerRegion: text("invoice_customer_region"),
  invoiceCustomerPostalCode: text("invoice_customer_postal_code"),
  invoiceCustomerCountryCode: text("invoice_customer_country_code"),
  taxPricingModeSnapshot: taxPricingModeEnum("tax_pricing_mode_snapshot")
    .default("INCLUSIVE")
    .notNull(),
  taxRateBpsSnapshot: integer("tax_rate_bps_snapshot").default(0).notNull(),
  customerCancellationFeeBpsSnapshot: integer(
    "customer_cancellation_fee_bps_snapshot",
  )
    .default(0)
    .notNull(),
  cancellationFeeBpsApplied: integer("cancellation_fee_bps_applied"),
  cancellationFeeAmount: numeric("cancellation_fee_amount", {
    precision: 10,
    scale: 2,
  }),
  refundAmount: numeric("refund_amount", { precision: 10, scale: 2 }),
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
  index("orders_restaurant_status_created_idx").on(
    table.organizationId,
    table.status,
    table.createdAt,
  ),
  index("orders_customer_created_idx").on(table.customerId, table.createdAt),
  index("orders_organization_customer_created_idx").on(
    table.organizationCustomerId,
    table.createdAt,
  ),
  index("orders_created_by_user_idx").on(table.createdByUserId),
  index("orders_ordering_point_idx").on(table.orderingPointId),
  index("orders_payment_status_idx").on(table.paymentStatus),
  index("orders_payment_account_org_idx").on(table.paymentAccountOrganizationId),
  index("orders_stripe_connected_account_idx").on(table.stripeConnectedAccountId),
  uniqueIndex("orders_stripe_checkout_session_unique").on(
    table.stripeCheckoutSessionId,
  ),
  uniqueIndex("orders_stripe_payment_intent_unique").on(
    table.stripePaymentIntentId,
  ),
  uniqueIndex("orders_restaurant_order_date_no_unique").on(
    table.organizationId,
    table.orderDate,
    table.orderNo,
  ),
  index("orders_restaurant_promised_fulfilment_idx").on(
    table.organizationId,
    table.promisedFulfilmentAt,
  ),
  uniqueIndex("orders_restaurant_receipt_number_unique").on(
    table.organizationId,
    table.receiptNumber,
  ),
  uniqueIndex("orders_restaurant_invoice_number_unique").on(
    table.organizationId,
    table.invoiceNumber,
  ),
  uniqueIndex("orders_id_organization_unique").on(
    table.id,
    table.organizationId,
  ),
  check(
    "orders_tax_rate_bps_snapshot_check",
    sql`${table.taxRateBpsSnapshot} >= 0 AND ${table.taxRateBpsSnapshot} <= 10000`,
  ),
  check(
    "orders_customer_cancellation_fee_bps_snapshot_check",
    sql`${table.customerCancellationFeeBpsSnapshot} >= 0 AND ${table.customerCancellationFeeBpsSnapshot} <= 10000`,
  ),
  check(
    "orders_cancellation_fee_bps_applied_check",
    sql`${table.cancellationFeeBpsApplied} IS NULL OR (${table.cancellationFeeBpsApplied} >= 0 AND ${table.cancellationFeeBpsApplied} <= ${table.customerCancellationFeeBpsSnapshot})`,
  ),
  check(
    "orders_cancellation_amounts_check",
    sql`(${table.cancellationFeeAmount} IS NULL AND ${table.refundAmount} IS NULL) OR (${table.cancellationFeeAmount} IS NOT NULL AND ${table.cancellationFeeAmount} >= 0 AND ${table.refundAmount} IS NOT NULL AND ${table.refundAmount} >= 0 AND ${table.cancellationFeeAmount} + ${table.refundAmount} = ${table.paymentCollectedAmount})`,
  ),
  check(
    "orders_payment_collected_amount_check",
    sql`${table.paymentCollectedAmount} >= 0 AND ((${table.paymentAmount} IS NULL AND ${table.paymentCollectedAmount} = 0) OR (${table.paymentAmount} IS NOT NULL AND ${table.paymentCollectedAmount} <= ${table.paymentAmount}))`,
  ),
  check(
    "orders_financial_snapshot_completeness_check",
    sql`(${table.subtotalAmountSnapshot} IS NULL AND ${table.discountAmountSnapshot} IS NULL AND ${table.taxAmountSnapshot} IS NULL AND ${table.chargeAmountSnapshot} IS NULL AND ${table.tipAmountSnapshot} IS NULL AND ${table.finalTotalAmountSnapshot} IS NULL AND ${table.financialSnapshotCurrency} IS NULL AND ${table.financialSnapshotAt} IS NULL) OR (${table.subtotalAmountSnapshot} IS NOT NULL AND ${table.discountAmountSnapshot} IS NOT NULL AND ${table.taxAmountSnapshot} IS NOT NULL AND ${table.chargeAmountSnapshot} IS NOT NULL AND ${table.tipAmountSnapshot} IS NOT NULL AND ${table.finalTotalAmountSnapshot} IS NOT NULL AND ${table.financialSnapshotCurrency} IS NOT NULL)`,
  ),
  check(
    "orders_financial_snapshot_amounts_check",
    sql`${table.subtotalAmountSnapshot} IS NULL OR (${table.subtotalAmountSnapshot} >= 0 AND ${table.discountAmountSnapshot} >= 0 AND ${table.discountAmountSnapshot} <= ${table.subtotalAmountSnapshot} AND ${table.taxAmountSnapshot} >= 0 AND ${table.chargeAmountSnapshot} >= 0 AND ${table.tipAmountSnapshot} >= 0 AND ${table.finalTotalAmountSnapshot} = ${table.subtotalAmountSnapshot} - ${table.discountAmountSnapshot} + ${table.taxAmountSnapshot} + ${table.chargeAmountSnapshot} + ${table.tipAmountSnapshot})`,
  ),
  check(
    "orders_financial_snapshot_currency_check",
    sql`${table.financialSnapshotCurrency} IS NULL OR (char_length(${table.financialSnapshotCurrency}) = 3 AND ${table.financialSnapshotCurrency} = upper(${table.financialSnapshotCurrency}))`,
  ),
  check(
    "orders_receipt_issuance_check",
    sql`(${table.receiptNumber} IS NULL AND ${table.receiptIssuedAt} IS NULL) OR (${table.receiptNumber} > 0 AND ${table.receiptIssuedAt} IS NOT NULL)`,
  ),
  check(
    "orders_invoice_issuance_check",
    sql`(
      ${table.invoiceNumber} IS NULL
      AND ${table.invoiceIssuedAt} IS NULL
      AND ${table.vatInvoiceType} IS NULL
      AND ${table.invoiceTaxPointAt} IS NULL
      AND ${table.invoiceSupplierName} IS NULL
      AND ${table.invoiceSupplierAddressLine1} IS NULL
      AND ${table.invoiceSupplierAddressLine2} IS NULL
      AND ${table.invoiceSupplierCity} IS NULL
      AND ${table.invoiceSupplierRegion} IS NULL
      AND ${table.invoiceSupplierPostalCode} IS NULL
      AND ${table.invoiceSupplierCountryCode} IS NULL
      AND ${table.invoiceSupplierVatNumber} IS NULL
      AND ${table.invoiceCustomerName} IS NULL
      AND ${table.invoiceCustomerAddressLine1} IS NULL
      AND ${table.invoiceCustomerAddressLine2} IS NULL
      AND ${table.invoiceCustomerCity} IS NULL
      AND ${table.invoiceCustomerRegion} IS NULL
      AND ${table.invoiceCustomerPostalCode} IS NULL
      AND ${table.invoiceCustomerCountryCode} IS NULL
    ) OR (
      ${table.invoiceNumber} > 0
      AND ${table.invoiceIssuedAt} IS NOT NULL
      AND ${table.vatInvoiceType} IS NOT NULL
      AND ${table.invoiceTaxPointAt} IS NOT NULL
      AND NULLIF(BTRIM(${table.invoiceSupplierName}), '') IS NOT NULL
      AND NULLIF(BTRIM(${table.invoiceSupplierAddressLine1}), '') IS NOT NULL
      AND NULLIF(BTRIM(${table.invoiceSupplierCity}), '') IS NOT NULL
      AND NULLIF(BTRIM(${table.invoiceSupplierPostalCode}), '') IS NOT NULL
      AND ${table.invoiceSupplierCountryCode} ~ '^[A-Z]{2}$'
      AND NULLIF(BTRIM(${table.invoiceSupplierVatNumber}), '') IS NOT NULL
      AND (
        ${table.vatInvoiceType} = 'SIMPLIFIED'
        OR (
          NULLIF(BTRIM(${table.invoiceCustomerName}), '') IS NOT NULL
          AND NULLIF(BTRIM(${table.invoiceCustomerAddressLine1}), '') IS NOT NULL
          AND NULLIF(BTRIM(${table.invoiceCustomerCity}), '') IS NOT NULL
          AND NULLIF(BTRIM(${table.invoiceCustomerPostalCode}), '') IS NOT NULL
          AND ${table.invoiceCustomerCountryCode} ~ '^[A-Z]{2}$'
        )
      )
    )`,
  ),
]);

export const orderCancellations = pgTable(
  "order_cancellations",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: uuid("organization_id")
      .references(() => organizations.id, { onDelete: "cascade" })
      .notNull(),
    orderId: uuid("order_id")
      .references(() => orders.id, { onDelete: "cascade" })
      .notNull(),
    actorType: cancelledByTypeEnum("actor_type").notNull(),
    actorUserId: uuid("actor_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    reason: text("reason"),
    disclosedFeeBps: integer("disclosed_fee_bps").notNull(),
    appliedFeeBps: integer("applied_fee_bps").notNull(),
    grossAmount: numeric("gross_amount", { precision: 10, scale: 2 }),
    feeAmount: numeric("fee_amount", { precision: 10, scale: 2 }),
    refundAmount: numeric("refund_amount", { precision: 10, scale: 2 }),
    currency: text("currency"),
    overrideReason: text("override_reason"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("order_cancellations_order_unique").on(table.orderId),
    index("order_cancellations_organization_created_idx").on(
      table.organizationId,
      table.createdAt,
    ),
    check(
      "order_cancellations_fee_bps_check",
      sql`${table.disclosedFeeBps} >= 0 AND ${table.disclosedFeeBps} <= 10000 AND ${table.appliedFeeBps} >= 0 AND ${table.appliedFeeBps} <= ${table.disclosedFeeBps}`,
    ),
    check(
      "order_cancellations_amounts_check",
      sql`(${table.grossAmount} IS NULL AND ${table.feeAmount} IS NULL AND ${table.refundAmount} IS NULL AND ${table.currency} IS NULL) OR (${table.grossAmount} IS NOT NULL AND ${table.grossAmount} >= 0 AND ${table.feeAmount} IS NOT NULL AND ${table.feeAmount} >= 0 AND ${table.refundAmount} IS NOT NULL AND ${table.refundAmount} >= 0 AND ${table.currency} IS NOT NULL AND ${table.feeAmount} + ${table.refundAmount} = ${table.grossAmount})`,
    ),
  ],
);

export const orderPayments = pgTable(
  "order_payments",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: uuid("organization_id")
      .references(() => organizations.id, { onDelete: "cascade" })
      .notNull(),
    orderId: uuid("order_id")
      .references(() => orders.id, { onDelete: "cascade" })
      .notNull(),
    method: orderPaymentMethodEnum("method").notNull(),
    status: orderPaymentRecordStatusEnum("status")
      .default("PENDING")
      .notNull(),
    amount: numeric("amount", { precision: 10, scale: 2 }).notNull(),
    currency: text("currency").notNull(),
    tenderedAmount: numeric("tendered_amount", { precision: 10, scale: 2 }),
    changeAmount: numeric("change_amount", { precision: 10, scale: 2 }),
    receivedByUserId: uuid("received_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    cashDrawerSessionId: uuid("cash_drawer_session_id").references(
      () => cashDrawerSessions.id,
      { onDelete: "set null" },
    ),
    stripeConnectedAccountId: text("stripe_connected_account_id"),
    stripeCheckoutSessionId: text("stripe_checkout_session_id"),
    stripePaymentIntentId: text("stripe_payment_intent_id"),
    completedAt: timestamp("completed_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    index("order_payments_organization_order_idx").on(
      table.organizationId,
      table.orderId,
    ),
    index("order_payments_order_status_created_idx").on(
      table.orderId,
      table.status,
      table.createdAt,
    ),
    index("order_payments_cash_drawer_session_idx").on(
      table.cashDrawerSessionId,
    ),
    uniqueIndex("order_payments_stripe_checkout_session_unique").on(
      table.stripeCheckoutSessionId,
    ),
    uniqueIndex("order_payments_stripe_payment_intent_unique").on(
      table.stripePaymentIntentId,
    ),
    check("order_payments_amount_check", sql`${table.amount} > 0`),
    check(
      "order_payments_cash_amounts_check",
      sql`(${table.method} = 'CASH' AND ${table.tenderedAmount} IS NOT NULL AND ${table.changeAmount} IS NOT NULL AND ${table.tenderedAmount} >= ${table.amount} AND ${table.changeAmount} = ${table.tenderedAmount} - ${table.amount}) OR (${table.method} = 'STRIPE_CHECKOUT' AND ${table.tenderedAmount} IS NULL AND ${table.changeAmount} IS NULL)`,
    ),
  ],
);

export const orderRefunds = pgTable(
  "order_refunds",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: uuid("organization_id")
      .references(() => organizations.id, { onDelete: "cascade" })
      .notNull(),
    orderId: uuid("order_id")
      .references(() => orders.id, { onDelete: "cascade" })
      .notNull(),
    cancellationId: uuid("cancellation_id")
      .references(() => orderCancellations.id, { onDelete: "cascade" })
      .notNull(),
    orderPaymentId: uuid("order_payment_id")
      .references(() => orderPayments.id, { onDelete: "restrict" })
      .notNull(),
    provider: paymentProviderEnum("provider").default("STRIPE").notNull(),
    status: refundStatusEnum("status").default("PENDING").notNull(),
    amount: numeric("amount", { precision: 10, scale: 2 }).notNull(),
    currency: text("currency").notNull(),
    stripeRefundId: text("stripe_refund_id"),
    idempotencyKey: text("idempotency_key").notNull(),
    failureReason: text("failure_reason"),
    requestedByUserId: uuid("requested_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    cashDrawerSessionId: uuid("cash_drawer_session_id"),
    requestedAt: timestamp("requested_at").defaultNow().notNull(),
    processedAt: timestamp("processed_at"),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    foreignKey({
      columns: [table.cashDrawerSessionId, table.organizationId],
      foreignColumns: [cashDrawerSessions.id, cashDrawerSessions.organizationId],
      name: "order_refunds_cash_drawer_session_organization_fk",
    }).onDelete("no action"),
    index("order_refunds_order_requested_idx").on(
      table.orderId,
      table.requestedAt,
    ),
    index("order_refunds_payment_idx").on(table.orderPaymentId),
    index("order_refunds_cash_drawer_session_idx").on(
      table.cashDrawerSessionId,
    ),
    uniqueIndex("order_refunds_stripe_refund_unique").on(table.stripeRefundId),
    uniqueIndex("order_refunds_idempotency_key_unique").on(
      table.idempotencyKey,
    ),
    uniqueIndex("order_refunds_one_pending_per_payment_unique")
      .on(table.cancellationId, table.orderPaymentId)
      .where(sql`${table.status} = 'PENDING'`),
    check("order_refunds_amount_check", sql`${table.amount} > 0`),
  ],
);

export const orderItems = pgTable("order_items", {
  id: uuid("id").defaultRandom().primaryKey(),
  organizationId: uuid("organization_id")
    .references(() => organizations.id, { onDelete: "cascade" })
    .notNull(),
  orderId: uuid("order_id")
    .references(() => orders.id, { onDelete: "cascade" })
    .notNull(),
  categoryId: text("category_id").notNull(),
  categoryName: text("category_name").notNull(),
  drinkId: text("drink_id").notNull(),
  drinkName: text("drink_name").notNull(),
  prepStationId: uuid("prep_station_id"),
  prepStationNameSnapshot: text("prep_station_name_snapshot"),
  quantity: integer("quantity").default(1).notNull(),
  notes: text("notes"),
  unitPrice: numeric("unit_price", { precision: 10, scale: 2 }),
  taxRateBpsSnapshot: integer("tax_rate_bps_snapshot").default(0).notNull(),
  taxableAmountSnapshot: numeric("taxable_amount_snapshot", {
    precision: 10,
    scale: 2,
  }),
  taxAmountSnapshot: numeric("tax_amount_snapshot", {
    precision: 10,
    scale: 2,
  }),
  status: orderItemStatusEnum("status").default("PENDING").notNull(),
  startedAt: timestamp("started_at"),
  readyAt: timestamp("ready_at"),
  deliveredAt: timestamp("delivered_at"),
  cancelledAt: timestamp("cancelled_at"),
  inventoryReservedAt: timestamp("inventory_reserved_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => [
  index("order_items_restaurant_order_idx").on(
    table.organizationId,
    table.orderId,
  ),
  uniqueIndex("order_items_id_order_organization_unique").on(
    table.id,
    table.orderId,
    table.organizationId,
  ),
  index("order_items_prep_station_status_idx").on(
    table.organizationId,
    table.prepStationId,
    table.status,
    table.createdAt,
  ),
  foreignKey({
    columns: [table.prepStationId, table.organizationId],
    foreignColumns: [prepStations.id, prepStations.organizationId],
    name: "order_items_prep_station_organization_fk",
  }).onDelete("restrict"),
  check(
    "order_items_prep_station_snapshot_check",
    sql`(${table.prepStationId} IS NULL AND ${table.prepStationNameSnapshot} IS NULL) OR (${table.prepStationId} IS NOT NULL AND char_length(btrim(${table.prepStationNameSnapshot})) BETWEEN 1 AND 80)`,
  ),
  check(
    "order_items_tax_rate_bps_snapshot_check",
    sql`${table.taxRateBpsSnapshot} >= 0 AND ${table.taxRateBpsSnapshot} <= 10000`,
  ),
  check(
    "order_items_tax_amount_snapshots_check",
    sql`(${table.taxableAmountSnapshot} IS NULL AND ${table.taxAmountSnapshot} IS NULL) OR (${table.taxableAmountSnapshot} IS NOT NULL AND ${table.taxableAmountSnapshot} >= 0 AND ${table.taxAmountSnapshot} IS NOT NULL AND ${table.taxAmountSnapshot} >= 0)`,
  ),
]);

export const orderItemModifiers = pgTable(
  "order_item_modifiers",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: uuid("organization_id")
      .references(() => organizations.id, { onDelete: "cascade" })
      .notNull(),
    orderItemId: uuid("order_item_id")
      .references(() => orderItems.id, { onDelete: "cascade" })
      .notNull(),
    modifierGroupId: text("modifier_group_id").notNull(),
    modifierGroupName: text("modifier_group_name").notNull(),
    modifierId: text("modifier_id").notNull(),
    modifierName: text("modifier_name").notNull(),
    quantity: integer("quantity").default(1).notNull(),
    priceDelta: numeric("price_delta", { precision: 10, scale: 2 })
      .default("0")
      .notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    index("order_item_modifiers_order_item_idx").on(table.orderItemId),
    index("order_item_modifiers_organization_idx").on(table.organizationId),
  ],
);

export const orderAdjustments = pgTable(
  "order_adjustments",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: uuid("organization_id")
      .references(() => organizations.id, { onDelete: "cascade" })
      .notNull(),
    orderId: uuid("order_id").notNull(),
    orderItemId: uuid("order_item_id"),
    type: orderAdjustmentTypeEnum("type").notNull(),
    scope: orderAdjustmentScopeEnum("scope").notNull(),
    calculation: orderAdjustmentCalculationEnum("calculation").notNull(),
    entryKind: orderAdjustmentEntryKindEnum("entry_kind")
      .default("APPLY")
      .notNull(),
    basisAmount: numeric("basis_amount", { precision: 10, scale: 2 }).notNull(),
    rateBps: integer("rate_bps"),
    amount: numeric("amount", { precision: 10, scale: 2 }).notNull(),
    currency: text("currency").notNull(),
    reasonCode: text("reason_code"),
    note: text("note"),
    actorType: orderAdjustmentActorTypeEnum("actor_type").notNull(),
    actorUserId: uuid("actor_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    actorCustomerId: uuid("actor_customer_id").references(() => customers.id, {
      onDelete: "set null",
    }),
    reversesAdjustmentId: uuid("reverses_adjustment_id").references(
      (): AnyPgColumn => orderAdjustments.id,
      { onDelete: "restrict" },
    ),
    idempotencyKey: text("idempotency_key").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    index("order_adjustments_organization_order_created_idx").on(
      table.organizationId,
      table.orderId,
      table.createdAt,
    ),
    index("order_adjustments_order_item_idx").on(table.orderItemId),
    uniqueIndex("order_adjustments_organization_idempotency_unique").on(
      table.organizationId,
      table.idempotencyKey,
    ),
    uniqueIndex("order_adjustments_reversal_unique")
      .on(table.reversesAdjustmentId)
      .where(sql`${table.reversesAdjustmentId} IS NOT NULL`),
    foreignKey({
      columns: [table.orderId, table.organizationId],
      foreignColumns: [orders.id, orders.organizationId],
      name: "order_adjustments_order_organization_fk",
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.orderItemId, table.orderId, table.organizationId],
      foreignColumns: [
        orderItems.id,
        orderItems.orderId,
        orderItems.organizationId,
      ],
      name: "order_adjustments_item_order_organization_fk",
    }).onDelete("restrict"),
    check(
      "order_adjustments_scope_check",
      sql`(${table.scope} = 'ORDER' AND ${table.orderItemId} IS NULL) OR (${table.scope} = 'ITEM' AND ${table.orderItemId} IS NOT NULL)`,
    ),
    check(
      "order_adjustments_calculation_check",
      sql`(${table.calculation} = 'FIXED_AMOUNT' AND ${table.rateBps} IS NULL) OR (${table.calculation} = 'PERCENTAGE' AND ${table.rateBps} IS NOT NULL AND ${table.rateBps} > 0 AND ${table.rateBps} <= 10000)`,
    ),
    check(
      "order_adjustments_amount_check",
      sql`${table.basisAmount} >= 0 AND ${table.amount} > 0 AND (${table.type} NOT IN ('DISCOUNT', 'COMP') OR ${table.amount} <= ${table.basisAmount})`,
    ),
    check(
      "order_adjustments_reason_check",
      sql`${table.type} NOT IN ('DISCOUNT', 'COMP') OR (${table.reasonCode} IS NOT NULL AND char_length(btrim(${table.reasonCode})) > 0)`,
    ),
    check(
      "order_adjustments_reversal_check",
      sql`(${table.entryKind} = 'APPLY' AND ${table.reversesAdjustmentId} IS NULL) OR (${table.entryKind} = 'REVERSAL' AND ${table.reversesAdjustmentId} IS NOT NULL)`,
    ),
    check(
      "order_adjustments_currency_check",
      sql`char_length(${table.currency}) = 3 AND ${table.currency} = upper(${table.currency})`,
    ),
    check(
      "order_adjustments_actor_check",
      sql`(${table.actorType} = 'STAFF' AND ${table.actorCustomerId} IS NULL) OR (${table.actorType} = 'CUSTOMER' AND ${table.actorUserId} IS NULL) OR (${table.actorType} = 'SYSTEM' AND ${table.actorUserId} IS NULL AND ${table.actorCustomerId} IS NULL)`,
    ),
  ],
);
