import fs from "node:fs";
import postgres from "postgres";

const PLATFORM_ORGANIZATION_ID = "00000000-0000-0000-0000-000000000000";

function readDatabaseUrl() {
  const envLine = fs
    .readFileSync(".env.local", "utf8")
    .split(/\r?\n/)
    .find((line) => line.startsWith("DATABASE_URL="));

  if (!envLine) {
    throw new Error("DATABASE_URL is missing from .env.local.");
  }

  return envLine
    .slice("DATABASE_URL=".length)
    .trim()
    .replace(/^['"]|['"]$/g, "");
}

const sql = postgres(readDatabaseUrl(), { prepare: false });

try {
  const [platform] = await sql`
    select id, name, type
    from organizations
    where id = ${PLATFORM_ORGANIZATION_ID}
      and type = 'PLATFORM'
  `;

  if (!platform) {
    throw new Error("Platform organization is missing. Run migrations first.");
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

  console.log("Tenant foundation verified.");
  console.log(`Platform organization: ${platform.name}`);
} finally {
  await sql.end();
}
