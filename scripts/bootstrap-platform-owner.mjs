import { randomBytes, scrypt } from "node:crypto";
import { promisify } from "node:util";
import postgres from "postgres";

import { loadDeploymentEnv, resolveDeploymentConfig } from "./deployment-config.mjs";

const scryptAsync = promisify(scrypt);
const platformOrganizationId = "00000000-0000-0000-0000-000000000000";

async function hashPassword(password) {
  const salt = randomBytes(16).toString("hex");
  const key = await scryptAsync(password, salt, 64);

  return `scrypt:${salt}:${Buffer.from(key).toString("hex")}`;
}

const env = loadDeploymentEnv();
const deployment = resolveDeploymentConfig(env);

if (!env.DATABASE_URL) {
  throw new Error("DATABASE_URL is missing from .env.local or the current shell.");
}

const username = env.PLATFORM_OWNER_USERNAME?.trim();
const password = env.PLATFORM_OWNER_PASSWORD?.trim();

if (!username || !password) {
  throw new Error(
    "PLATFORM_OWNER_USERNAME and PLATFORM_OWNER_PASSWORD are required for SaaS owner bootstrap.",
  );
}

const sql = postgres(env.DATABASE_URL, { prepare: false });

try {
  const [existingDeploymentCell] = await sql`
    select cell_id
    from deployment_cells
    where id = 1
    limit 1
  `;

  if (
    existingDeploymentCell &&
    existingDeploymentCell.cell_id !== deployment.cellId
  ) {
    throw new Error(
      `Database belongs to deployment cell ${existingDeploymentCell.cell_id}, not ${deployment.cellId}.`,
    );
  }

  await sql`
    insert into deployment_cells (
      id,
      cell_id,
      region,
      root_domain,
      default_locale,
      default_timezone,
      default_currency,
      updated_at
    )
    values (
      1,
      ${deployment.cellId},
      ${deployment.region},
      ${deployment.rootDomain},
      ${deployment.locale},
      ${deployment.timezone},
      ${deployment.currency},
      now()
    )
    on conflict (id)
    do update set
      region = excluded.region,
      root_domain = excluded.root_domain,
      default_locale = excluded.default_locale,
      default_timezone = excluded.default_timezone,
      default_currency = excluded.default_currency,
      updated_at = now()
  `;

  const email =
    env.PLATFORM_OWNER_EMAIL?.trim().toLowerCase() ??
    `${username.toLowerCase()}@platform.staff.local`;
  const [existingUser] = await sql`
    select id
    from users
    where username = ${username}
      or email = ${email}
    limit 1
  `;

  const userId =
    existingUser?.id ??
    (
      await sql`
        insert into users (
          username,
          name,
          email,
          password_hash,
          role,
          status,
          updated_at
        )
        values (
          ${username},
          ${username},
          ${email},
          ${await hashPassword(password)},
          'ADMIN',
          'ACTIVE',
          now()
        )
        returning id
      `
    )[0].id;

  await sql`
    update users
    set
      password_hash = ${await hashPassword(password)},
      role = 'ADMIN',
      status = 'ACTIVE',
      updated_at = now()
    where id = ${userId}
  `;

  await sql`
    insert into organizations (
      id,
      parent_organization_id,
      type,
      slug,
      name,
      timezone,
      currency,
      is_active,
      updated_at
    )
    values (
      ${platformOrganizationId},
      null,
      'PLATFORM',
      'foodie-platform',
      'Foodie Platform',
      ${deployment.timezone},
      ${deployment.currency},
      true,
      now()
    )
    on conflict (id)
    do update set
      type = 'PLATFORM',
      slug = 'foodie-platform',
      name = 'Foodie Platform',
      timezone = ${deployment.timezone},
      currency = ${deployment.currency},
      is_active = true,
      updated_at = now()
  `;

  const [existingRootDomain] = await sql`
    select scope
    from tenant_domains
    where domain = ${deployment.rootDomain}
    limit 1
  `;

  if (existingRootDomain && existingRootDomain.scope !== "PLATFORM") {
    throw new Error(
      `Configured root domain ${deployment.rootDomain} is already assigned to a tenant.`,
    );
  }

  await sql`
    update tenant_domains
    set
      is_primary = false,
      updated_at = now()
    where scope = 'PLATFORM'
      and domain <> ${deployment.rootDomain}
      and is_primary = true
  `;

  await sql`
    insert into tenant_domains (
      domain,
      scope,
      purpose,
      company_organization_id,
      restaurant_organization_id,
      location_id,
      is_primary,
      is_active,
      updated_at
    )
    values (
      ${deployment.rootDomain},
      'PLATFORM',
      'ADMIN',
      null,
      null,
      null,
      true,
      true,
      now()
    )
    on conflict (domain)
    do update set
      scope = 'PLATFORM',
      purpose = 'ADMIN',
      company_organization_id = null,
      restaurant_organization_id = null,
      location_id = null,
      is_primary = true,
      is_active = true,
      updated_at = now()
  `;

  const [existingMembership] = await sql`
    select id
    from memberships
    where user_id = ${userId}
      and organization_id = ${platformOrganizationId}
      and location_id is null
    order by updated_at desc
    limit 1
  `;

  if (existingMembership) {
    await sql`
      update memberships
      set
        role = 'PLATFORM_ADMIN',
        is_active = true,
        updated_at = now()
      where id = ${existingMembership.id}
    `;
  } else {
    await sql`
    insert into memberships (
      user_id,
      organization_id,
      location_id,
      role,
      is_active,
      updated_at
    )
    values (
      ${userId},
      ${platformOrganizationId},
      null,
      'PLATFORM_ADMIN',
      true,
      now()
    )
  `;
  }

  console.log(`Platform owner verified: ${username}`);
  console.log(
    `Deployment verified: ${deployment.cellId} / ${deployment.region} (${deployment.rootDomain})`,
  );
} finally {
  await sql.end();
}
