import "server-only";

import { and, eq } from "drizzle-orm";

import { getDb } from "@/db";
import { organizations } from "@/db/schema";
import type { RestaurantReceiptSettings } from "@/lib/receipt-settings";
import { restaurantReceiptSettingsSchema } from "@/lib/validations/receipt-settings";

export async function getRestaurantReceiptSettings(
  organizationId: string,
): Promise<RestaurantReceiptSettings | null> {
  const [organization] = await getDb()
    .select({
      footerMessage: organizations.receiptFooterMessage,
      printFormat: organizations.receiptPrintFormat,
    })
    .from(organizations)
    .where(
      and(
        eq(organizations.id, organizationId),
        eq(organizations.type, "RESTAURANT"),
      ),
    )
    .limit(1);

  return organization ?? null;
}

export async function updateRestaurantReceiptSettings(
  organizationId: string,
  input: unknown,
) {
  const parsed = restaurantReceiptSettingsSchema.parse(input);
  const [updated] = await getDb()
    .update(organizations)
    .set({
      receiptFooterMessage: parsed.footerMessage || null,
      receiptPrintFormat: parsed.printFormat,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(organizations.id, organizationId),
        eq(organizations.type, "RESTAURANT"),
      ),
    )
    .returning({
      footerMessage: organizations.receiptFooterMessage,
      printFormat: organizations.receiptPrintFormat,
    });

  if (!updated) {
    throw new Error("Restaurant not found.");
  }

  return updated;
}
