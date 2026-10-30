import { and, eq, ne } from "drizzle-orm";

import { getDb } from "@/db";
import { organizations } from "@/db/schema";
import { slugify } from "@/lib/slugs";

export async function ensureUniqueOrganizationSlug(
  baseName: string,
  organizationType: typeof organizations.$inferSelect.type,
  currentOrganizationId?: string,
) {
  const db = getDb();
  const baseSlug = slugify(baseName) || "tenant";
  let candidate = baseSlug;
  let suffix = 2;

  while (true) {
    const [existing] = await db
      .select({ id: organizations.id })
      .from(organizations)
      .where(
        and(
          eq(organizations.slug, candidate),
          eq(organizations.type, organizationType),
          currentOrganizationId ? ne(organizations.id, currentOrganizationId) : undefined,
        ),
      )
      .limit(1);

    if (!existing) {
      return candidate;
    }

    candidate = `${baseSlug}-${suffix}`;
    suffix += 1;
  }
}
