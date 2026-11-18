import { eq, inArray, is, or, sql } from "drizzle-orm";
import { getTableConfig, PgTable } from "drizzle-orm/pg-core";

import * as schema from "@/db/schema";

export function accountRecordChecks(userId: string) {
  return Object.values(schema).flatMap((table) => {
    if (!is(table, PgTable)) return [];
    const links = getTableConfig(table).foreignKeys.flatMap((key) => {
      const reference = key.reference();
      return reference.foreignColumns.flatMap((column, index) =>
        column === schema.users.id ? [eq(reference.columns[index], userId)] : [],
      );
    });
    return links.length ? [sql`exists (select 1 from ${table} where ${or(...links)})`] : [];
  });
}

export function membershipActivityChecks(membershipIds: string[]) {
  return Object.values(schema).flatMap((table) => {
    if (!is(table, PgTable) || table === schema.staffInvitations || table === schema.staffJobAssignments) return [];
    const links = getTableConfig(table).foreignKeys.flatMap((key) => {
      const reference = key.reference();
      return reference.foreignColumns.flatMap((column, index) =>
        column === schema.memberships.id ? [inArray(reference.columns[index], membershipIds)] : [],
      );
    });
    return links.length ? [sql`exists (select 1 from ${table} where ${or(...links)})`] : [];
  });
}
