import postgres from "postgres";

import { loadDeploymentEnv, resolveDeploymentConfig } from "./deployment-config.mjs";

const PLATFORM_ORGANIZATION_ID = "00000000-0000-0000-0000-000000000000";

const env = loadDeploymentEnv();
const deployment = resolveDeploymentConfig(env);

if (!env.DATABASE_URL) {
  throw new Error("DATABASE_URL is missing from .env.local or the current shell.");
}

const sql = postgres(env.DATABASE_URL, { prepare: false });

try {
  const [deploymentCell] = await sql`
    select
      cell_id,
      region,
      root_domain,
      default_locale,
      default_timezone,
      default_currency
    from deployment_cells
    where id = 1
    limit 1
  `;

  if (!deploymentCell) {
    throw new Error("Deployment cell is not bound to this database. Run db:bootstrap:platform.");
  }

  if (
    deploymentCell.cell_id !== deployment.cellId ||
    deploymentCell.region !== deployment.region ||
    deploymentCell.root_domain !== deployment.rootDomain ||
    deploymentCell.default_locale !== deployment.locale ||
    deploymentCell.default_timezone !== deployment.timezone ||
    deploymentCell.default_currency !== deployment.currency
  ) {
    throw new Error(
      `Database configuration does not match deployment cell ${deployment.cellId}. Run db:bootstrap:platform.`,
    );
  }

  const [platform] = await sql`
    select id, name, type, timezone, currency
    from organizations
    where id = ${PLATFORM_ORGANIZATION_ID}
      and type = 'PLATFORM'
  `;

  if (!platform) {
    throw new Error("Platform organization is missing. Run migrations first.");
  }

  if (
    platform.timezone !== deployment.timezone ||
    platform.currency !== deployment.currency
  ) {
    throw new Error(
      "Platform locale does not match this deployment cell. Run db:bootstrap:platform.",
    );
  }

  const [platformDomain] = await sql`
    select domain
    from tenant_domains
    where scope = 'PLATFORM'
      and is_primary = true
      and is_active = true
    limit 1
  `;

  if (platformDomain?.domain !== deployment.rootDomain) {
    throw new Error(
      "Platform root domain does not match this deployment cell. Run db:bootstrap:platform.",
    );
  }

  const localeColumns = await sql`
    select table_name, column_name, column_default
    from information_schema.columns
    where table_schema = 'public'
      and (
        (table_name = 'organizations' and column_name in ('timezone', 'currency'))
      )
  `;
  const defaultedColumn = localeColumns.find((column) => column.column_default !== null);

  if (defaultedColumn) {
    throw new Error(
      `${defaultedColumn.table_name}.${defaultedColumn.column_name} still has a regional database default. Run migrations.`,
    );
  }

  const operationalTables = [
    "menu_categories",
    "menu_items",
    "modifier_groups",
    "modifier_options",
    "inventory_items",
    "orders",
    "order_items",
    "order_item_modifiers",
  ];

  for (const table of operationalTables) {
    const [result] = await sql.unsafe(`
      select count(*)::int as missing_count
      from ${table}
      where organization_id is null
    `);

    if (result.missing_count > 0) {
      throw new Error(`${table} has ${result.missing_count} rows missing restaurant scope.`);
    }

    const [scope] = await sql.unsafe(`
      select count(*)::int as invalid_count
      from ${table} operational_record
      inner join organizations organization
        on organization.id = operational_record.organization_id
      where organization.type <> 'RESTAURANT'
    `);

    if (scope.invalid_count > 0) {
      throw new Error(`${table} has ${scope.invalid_count} rows outside restaurant scope.`);
    }
  }

  const [legacyLocationTable] = await sql`
    select to_regclass('public.locations') as table_name
  `;

  if (legacyLocationTable.table_name !== null) {
    throw new Error("Legacy locations table still exists. Run migrations.");
  }

  const legacyLocationColumns = await sql`
    select table_name
    from information_schema.columns
    where table_schema = 'public'
      and column_name = 'location_id'
  `;

  if (legacyLocationColumns.length > 0) {
    throw new Error(
      `Legacy location_id columns still exist on: ${legacyLocationColumns
        .map((column) => column.table_name)
        .join(", ")}. Run migrations.`,
    );
  }

  const legacyDomainScopes = await sql`
    select enumlabel
    from pg_enum
    inner join pg_type on pg_type.oid = pg_enum.enumtypid
    where pg_type.typname = 'tenant_domain_scope'
      and enumlabel = 'LOCATION'
  `;

  if (legacyDomainScopes.length > 0) {
    throw new Error("Legacy LOCATION domain scope still exists. Run migrations.");
  }

  const [orderOrderingPointScope] = await sql`
    select count(*)::int as invalid_count
    from orders order_record
    inner join ordering_points ordering_point
      on ordering_point.id = order_record.ordering_point_id
    where order_record.ordering_point_id is not null
      and ordering_point.organization_id <> order_record.organization_id
  `;

  if (orderOrderingPointScope.invalid_count > 0) {
    throw new Error(
      `orders has ${orderOrderingPointScope.invalid_count} cross-restaurant ordering-point links.`,
    );
  }

  const [orderingPointScope] = await sql`
    select count(*)::int as invalid_count
    from ordering_points ordering_point
    inner join organizations organization
      on organization.id = ordering_point.organization_id
    where organization.type <> 'RESTAURANT'
  `;

  if (orderingPointScope.invalid_count > 0) {
    throw new Error(
      `ordering_points has ${orderingPointScope.invalid_count} rows outside restaurant scope.`,
    );
  }

  const [tenantDomainScope] = await sql`
    select count(*)::int as invalid_count
    from tenant_domains domain_record
    left join organizations company
      on company.id = domain_record.company_organization_id
    left join organizations restaurant
      on restaurant.id = domain_record.restaurant_organization_id
    where (
        domain_record.scope = 'COMPANY'
        and (
          domain_record.purpose is distinct from 'ORDERING'
          or company.type is distinct from 'COMPANY'
          or domain_record.restaurant_organization_id is not null
        )
      )
      or (
        domain_record.scope = 'RESTAURANT'
        and (
          domain_record.purpose is distinct from 'ORDERING'
          or company.type is distinct from 'COMPANY'
          or restaurant.type is distinct from 'RESTAURANT'
          or restaurant.parent_organization_id is distinct from company.id
        )
      )
  `;

  if (tenantDomainScope.invalid_count > 0) {
    throw new Error(
      `tenant_domains has ${tenantDomainScope.invalid_count} rows outside company or restaurant customer scope. Run migrations.`,
    );
  }

  const integrationTables = [
    "organization_email_settings",
    "organization_payment_accounts",
    "organization_oauth_settings",
  ];

  for (const table of integrationTables) {
    const [integrationScope] = await sql.unsafe(`
      select count(*)::int as invalid_count
      from ${table} settings
      inner join organizations organization
        on organization.id = settings.organization_id
      where organization.type not in ('COMPANY', 'RESTAURANT')
    `);

    if (integrationScope.invalid_count > 0) {
      throw new Error(
        `${table} has ${integrationScope.invalid_count} rows outside company or restaurant scope.`,
      );
    }
  }

  console.log("Tenant foundation verified.");
  console.log(`Platform organization: ${platform.name}`);
  console.log(`Deployment cell: ${deployment.cellId}`);
} finally {
  await sql.end();
}
