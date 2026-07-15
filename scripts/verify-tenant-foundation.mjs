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
        or (table_name = 'locations' and column_name = 'timezone')
      )
  `;
  const defaultedColumn = localeColumns.find((column) => column.column_default !== null);

  if (defaultedColumn) {
    throw new Error(
      `${defaultedColumn.table_name}.${defaultedColumn.column_name} still has a regional database default. Run migrations.`,
    );
  }

  const tables = ["menu_categories", "menu_items", "orders", "order_items"];

  for (const table of tables) {
    const [result] = await sql.unsafe(`
      select count(*)::int as missing_count
      from ${table}
      where organization_id is null
        or ${table === "menu_categories" || table === "menu_items" ? "false" : "location_id is null"}
    `);

    if (result.missing_count > 0) {
      throw new Error(`${table} has ${result.missing_count} rows missing tenant scope.`);
    }
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

  console.log("Tenant foundation verified.");
  console.log(`Platform organization: ${platform.name}`);
  console.log(`Deployment cell: ${deployment.cellId}`);
} finally {
  await sql.end();
}
