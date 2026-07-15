import fs from "node:fs";
import path from "node:path";
import postgres from "postgres";

const rootDir = process.cwd();
const envPath = path.join(rootDir, ".env.local");
const migrationsDir = path.join(rootDir, "drizzle");
const resetSqlPath = path.join(rootDir, "scripts", "reset-dev-database.sql");

function loadDotEnv(filePath) {
  if (!fs.existsSync(filePath)) {
    return {};
  }

  return fs.readFileSync(filePath, "utf8").split(/\r?\n/).reduce((env, line) => {
    const trimmed = line.trim();

    if (!trimmed || trimmed.startsWith("#")) {
      return env;
    }

    const equalsIndex = trimmed.indexOf("=");

    if (equalsIndex === -1) {
      return env;
    }

    const key = trimmed.slice(0, equalsIndex).trim();
    let value = trimmed.slice(equalsIndex + 1).trim();

    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    env[key] = value;
    return env;
  }, {});
}

function stripComments(statement) {
  return statement
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/--.*$/gm, "")
    .trim();
}

function readDollarTag(source, index) {
  const match = source.slice(index).match(/^\$[A-Za-z_][A-Za-z0-9_]*\$|^\$\$/);
  return match?.[0] ?? null;
}

function splitSqlStatements(source) {
  const statements = [];
  let current = "";
  let singleQuoted = false;
  let doubleQuoted = false;
  let lineComment = false;
  let blockComment = false;
  let dollarTag = null;

  for (let i = 0; i < source.length; i += 1) {
    const char = source[i];
    const next = source[i + 1];

    if (lineComment) {
      current += char;

      if (char === "\n") {
        lineComment = false;
      }

      continue;
    }

    if (blockComment) {
      current += char;

      if (char === "*" && next === "/") {
        current += next;
        i += 1;
        blockComment = false;
      }

      continue;
    }

    if (dollarTag) {
      if (source.startsWith(dollarTag, i)) {
        current += dollarTag;
        i += dollarTag.length - 1;
        dollarTag = null;
      } else {
        current += char;
      }

      continue;
    }

    if (singleQuoted) {
      current += char;

      if (char === "'" && next === "'") {
        current += next;
        i += 1;
      } else if (char === "'") {
        singleQuoted = false;
      }

      continue;
    }

    if (doubleQuoted) {
      current += char;

      if (char === '"' && next === '"') {
        current += next;
        i += 1;
      } else if (char === '"') {
        doubleQuoted = false;
      }

      continue;
    }

    if (char === "-" && next === "-") {
      current += char + next;
      i += 1;
      lineComment = true;
      continue;
    }

    if (char === "/" && next === "*") {
      current += char + next;
      i += 1;
      blockComment = true;
      continue;
    }

    const tag = char === "$" ? readDollarTag(source, i) : null;

    if (tag) {
      current += tag;
      i += tag.length - 1;
      dollarTag = tag;
      continue;
    }

    if (char === "'") {
      current += char;
      singleQuoted = true;
      continue;
    }

    if (char === '"') {
      current += char;
      doubleQuoted = true;
      continue;
    }

    if (char === ";") {
      current += char;

      if (stripComments(current)) {
        statements.push(current.trim());
      }

      current = "";
      continue;
    }

    current += char;
  }

  if (stripComments(current)) {
    statements.push(current.trim());
  }

  return statements;
}

async function runSqlFile(sql, filePath, label) {
  const statements = splitSqlStatements(fs.readFileSync(filePath, "utf8"));

  for (const [index, statement] of statements.entries()) {
    process.stdout.write(`  ${label} statement ${index + 1}/${statements.length}\r`);
    await sql.unsafe(statement);
  }

  process.stdout.write(`  ${label} complete${" ".repeat(30)}\n`);
}

async function main() {
  const args = new Set(process.argv.slice(2));
  const shouldReset = args.has("--reset");
  const confirmedReset = args.has("--confirm-reset");
  const env = { ...loadDotEnv(envPath), ...process.env };
  const databaseUrl = env.DATABASE_URL;

  if (!databaseUrl) {
    throw new Error("DATABASE_URL is required in .env.local or the current shell.");
  }

  if (shouldReset && !confirmedReset) {
    throw new Error(
      "Refusing to reset without --confirm-reset. This deletes the public schema.",
    );
  }

  const sql = postgres(databaseUrl, { prepare: false });

  try {
    if (shouldReset) {
      console.log("Resetting public schema...");
      await runSqlFile(sql, resetSqlPath, "reset");
    }

    await sql`
      CREATE TABLE IF NOT EXISTS "app_migrations" (
        "name" text PRIMARY KEY,
        "applied_at" timestamp DEFAULT now() NOT NULL
      )
    `;

    const migrationFiles = fs
      .readdirSync(migrationsDir)
      .filter((fileName) => /^\d+.*\.sql$/.test(fileName))
      .sort((a, b) => a.localeCompare(b));

    for (const fileName of migrationFiles) {
      const existing = await sql`
        SELECT "name"
        FROM "app_migrations"
        WHERE "name" = ${fileName}
        LIMIT 1
      `;

      if (existing.length > 0) {
        console.log(`Skipping ${fileName}`);
        continue;
      }

      console.log(`Applying ${fileName}`);
      await sql.begin(async (transaction) => {
        await runSqlFile(
          transaction,
          path.join(migrationsDir, fileName),
          fileName,
        );
        await transaction`
          INSERT INTO "app_migrations" ("name")
          VALUES (${fileName})
        `;
      });
    }

    console.log("Database migrations complete.");
  } finally {
    await sql.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
