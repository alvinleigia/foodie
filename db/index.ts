import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import * as schema from "./schema";

let database:
  | ReturnType<typeof drizzle>
  | undefined;

const globalForDatabase = globalThis as typeof globalThis & {
  foodieDatabase?: ReturnType<typeof drizzle>;
};

if (process.env.NODE_ENV !== "production") {
  database = globalForDatabase.foodieDatabase;
}

export function getDb() {
  const databaseUrl = process.env.DATABASE_URL;

  if (!databaseUrl) {
    throw new Error("DATABASE_URL is missing. Add it to .env.local before using the API.");
  }

  if (!database) {
    const client = postgres(databaseUrl, {
      max: process.env.NODE_ENV === "development" ? 5 : 10,
      prepare: false,
    });
    database = drizzle(client, { schema });

    if (process.env.NODE_ENV !== "production") {
      globalForDatabase.foodieDatabase = database;
    }
  }

  return database;
}
