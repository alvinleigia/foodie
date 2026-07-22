import { sql } from "drizzle-orm";

import { getDb } from "@/db";
import {
  orders,
  restaurantDocumentCounters,
} from "@/db/schema";

type DbClient = ReturnType<typeof getDb>;
type TransactionClient = Parameters<Parameters<DbClient["transaction"]>[0]>[0];

type FinancialDocumentOrder = Pick<
  typeof orders.$inferSelect,
  "organizationId" | "receiptIssuedAt" | "receiptNumber"
>;

async function getNextDocumentNumber(
  tx: TransactionClient,
  organizationId: string,
  documentType: "RECEIPT" | "INVOICE",
) {
  const [counter] = await tx
    .insert(restaurantDocumentCounters)
    .values({
      documentType,
      lastNumber: 1,
      organizationId,
    })
    .onConflictDoUpdate({
      target: [
        restaurantDocumentCounters.organizationId,
        restaurantDocumentCounters.documentType,
      ],
      set: {
        lastNumber: sql`${restaurantDocumentCounters.lastNumber} + 1`,
        updatedAt: new Date(),
      },
    })
    .returning({ number: restaurantDocumentCounters.lastNumber });

  if (!counter) {
    throw new Error(`Could not allocate the next ${documentType.toLowerCase()} number.`);
  }

  return counter.number;
}

export async function getFinancialDocumentNumberUpdate(
  tx: TransactionClient,
  order: FinancialDocumentOrder,
  issuedAt: Date,
) {
  const receiptNumber =
    order.receiptNumber ??
    (await getNextDocumentNumber(tx, order.organizationId, "RECEIPT"));

  return {
    receiptIssuedAt: order.receiptIssuedAt ?? issuedAt,
    receiptNumber,
  };
}

export async function getNextInvoiceNumber(
  tx: TransactionClient,
  organizationId: string,
) {
  return getNextDocumentNumber(tx, organizationId, "INVOICE");
}

export function formatFinancialDocumentNumber(
  documentType: "RECEIPT" | "INVOICE",
  number: number,
) {
  const prefix = documentType === "RECEIPT" ? "R" : "INV";
  return `${prefix}-${number.toString().padStart(6, "0")}`;
}
