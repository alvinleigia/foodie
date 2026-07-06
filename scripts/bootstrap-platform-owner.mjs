import fs from "node:fs";
import { randomBytes, scrypt } from "node:crypto";
import { promisify } from "node:util";
import postgres from "postgres";

const scryptAsync = promisify(scrypt);
const platformOrganizationId = "00000000-0000-0000-0000-000000000000";

function readEnv() {
  const env = {};
  const content = fs.existsSync(".env.local") ? fs.readFileSync(".env.local", "utf8") : "";

  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();

    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }

    const separatorIndex = trimmed.indexOf("=");

    if (separatorIndex === -1) {
      continue;
    }

    const key = trimmed.slice(0, separatorIndex).trim();
    const value = trimmed
      .slice(separatorIndex + 1)
      .trim()
      .replace(/^['"]|['"]$/g, "");
    env[key] = value;
  }

  return env;
}

async function hashPassword(password) {
  const salt = randomBytes(16).toString("hex");
  const key = await scryptAsync(password, salt, 64);

  return `scrypt:${salt}:${Buffer.from(key).toString("hex")}`;
}

const env = { ...readEnv(), ...process.env };

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
      'Asia/Calcutta',
      'INR',
      true,
      now()
    )
    on conflict (id)
    do update set
      type = 'PLATFORM',
      slug = 'foodie-platform',
      name = 'Foodie Platform',
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
} finally {
  await sql.end();
}
