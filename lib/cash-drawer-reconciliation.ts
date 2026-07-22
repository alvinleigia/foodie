import "server-only";

import { and, eq } from "drizzle-orm";

import { getDb } from "@/db";
import {
  cashDrawerMovements,
  cashDrawerReconciliations,
  cashDrawerSessions,
  orderPayments,
  orderRefunds,
} from "@/db/schema";
import { writeAuditLog } from "@/lib/audit-log";
import {
  decimalToMinorUnits,
  minorUnitsToDecimal,
} from "@/lib/currency-money";
import type { MembershipRole } from "@/lib/staff-auth";

type CashDrawerActor = {
  id: string;
  membershipId: string;
  organizationId: string;
  role: MembershipRole;
  username?: string;
};

type CashDrawerTransaction = Parameters<
  Parameters<ReturnType<typeof getDb>["transaction"]>[0]
>[0];

type CashDrawerSession = typeof cashDrawerSessions.$inferSelect;

export class CashDrawerReconciliationError extends Error {
  status: number;

  constructor(message: string, status = 400) {
    super(message);
    this.name = "CashDrawerReconciliationError";
    this.status = status;
  }
}

function normalizeCountedCash(value: string, currency: string) {
  try {
    const amountMinor = decimalToMinorUnits(value, currency);

    if (amountMinor < 0) {
      throw new Error("Counted cash cannot be negative.");
    }

    return {
      amount: minorUnitsToDecimal(amountMinor, currency),
      amountMinor,
    };
  } catch {
    throw new CashDrawerReconciliationError(
      "Enter a valid counted cash amount greater than or equal to zero.",
    );
  }
}

function sumAmounts(
  rows: { amount: string; currency: string }[],
  currency: string,
) {
  return rows.reduce((total, row) => {
    if (row.currency.trim().toUpperCase() !== currency) {
      throw new CashDrawerReconciliationError(
        "The cash ledger contains a currency mismatch and must be reviewed.",
        409,
      );
    }

    return total + decimalToMinorUnits(row.amount, currency);
  }, 0);
}

async function calculateReconciliationSnapshot(
  tx: CashDrawerTransaction,
  session: CashDrawerSession,
) {
  const currency = session.currency.trim().toUpperCase();
  const cashPayments = await tx
    .select({
      amount: orderPayments.amount,
      currency: orderPayments.currency,
    })
    .from(orderPayments)
    .where(
      and(
        eq(orderPayments.organizationId, session.organizationId),
        eq(orderPayments.cashDrawerSessionId, session.id),
        eq(orderPayments.method, "CASH"),
        eq(orderPayments.status, "SUCCEEDED"),
      ),
    );
  const cashRefunds = await tx
    .select({
      amount: orderRefunds.amount,
      currency: orderRefunds.currency,
    })
    .from(orderRefunds)
    .where(
      and(
        eq(orderRefunds.organizationId, session.organizationId),
        eq(orderRefunds.cashDrawerSessionId, session.id),
        eq(orderRefunds.provider, "CASH"),
        eq(orderRefunds.status, "SUCCEEDED"),
      ),
    );
  const movements = await tx
    .select({
      amount: cashDrawerMovements.amount,
      currency: cashDrawerMovements.currency,
      type: cashDrawerMovements.type,
    })
    .from(cashDrawerMovements)
    .where(
      and(
        eq(cashDrawerMovements.organizationId, session.organizationId),
        eq(cashDrawerMovements.cashDrawerSessionId, session.id),
      ),
    );
  const openingFloatMinor = decimalToMinorUnits(session.openingFloat, currency);
  const cashSalesMinor = sumAmounts(cashPayments, currency);
  const cashRefundsMinor = sumAmounts(cashRefunds, currency);
  const paidInMinor = sumAmounts(
    movements.filter((movement) => movement.type === "PAID_IN"),
    currency,
  );
  const paidOutMinor = sumAmounts(
    movements.filter((movement) => movement.type === "PAID_OUT"),
    currency,
  );
  const expectedCashMinor =
    openingFloatMinor +
    cashSalesMinor +
    paidInMinor -
    cashRefundsMinor -
    paidOutMinor;

  if (expectedCashMinor < 0) {
    throw new CashDrawerReconciliationError(
      "Expected cash is below zero. Review paid-out movements and cash refunds before closing.",
      409,
    );
  }

  return {
    cashRefundsAmount: minorUnitsToDecimal(cashRefundsMinor, currency),
    cashSalesAmount: minorUnitsToDecimal(cashSalesMinor, currency),
    currency,
    expectedCashAmount: minorUnitsToDecimal(expectedCashMinor, currency),
    expectedCashMinor,
    openingFloat: minorUnitsToDecimal(openingFloatMinor, currency),
    paidInAmount: minorUnitsToDecimal(paidInMinor, currency),
    paidOutAmount: minorUnitsToDecimal(paidOutMinor, currency),
  };
}

async function findOpenSession(
  tx: CashDrawerTransaction,
  input: { orderingPointId: string; organizationId: string },
  lock: boolean,
) {
  const query = tx
    .select()
    .from(cashDrawerSessions)
    .where(
      and(
        eq(cashDrawerSessions.organizationId, input.organizationId),
        eq(cashDrawerSessions.orderingPointId, input.orderingPointId),
        eq(cashDrawerSessions.status, "OPEN"),
      ),
    )
    .limit(1);
  const rows = lock ? await query.for("update") : await query;
  const [session] = rows;

  if (!session) {
    throw new CashDrawerReconciliationError(
      "There is no open cash drawer to reconcile.",
      409,
    );
  }

  return session;
}

export async function getOpenCashDrawerReconciliation(input: {
  orderingPointId: string;
  organizationId: string;
}) {
  return getDb().transaction(async (tx) => {
    const session = await findOpenSession(tx, input, false);
    const snapshot = await calculateReconciliationSnapshot(tx, session);

    return { sessionId: session.id, ...snapshot };
  });
}

export async function closeCashDrawerSession(input: {
  actor: CashDrawerActor;
  closingNote?: string;
  countedCashAmount: string;
  orderingPointId: string;
  organizationId: string;
}) {
  const closingNote = input.closingNote?.trim() || null;
  const now = new Date();
  const result = await getDb().transaction(async (tx) => {
    const session = await findOpenSession(tx, input, true);
    const snapshot = await calculateReconciliationSnapshot(tx, session);
    const counted = normalizeCountedCash(
      input.countedCashAmount,
      snapshot.currency,
    );
    const varianceAmount = minorUnitsToDecimal(
      counted.amountMinor - snapshot.expectedCashMinor,
      snapshot.currency,
    );
    const [reconciliation] = await tx
      .insert(cashDrawerReconciliations)
      .values({
        cashDrawerSessionId: session.id,
        cashRefundsAmount: snapshot.cashRefundsAmount,
        cashSalesAmount: snapshot.cashSalesAmount,
        closingNote,
        closedByMembershipId: input.actor.membershipId,
        closedByUserId: input.actor.id,
        countedCashAmount: counted.amount,
        currency: snapshot.currency,
        expectedCashAmount: snapshot.expectedCashAmount,
        openingFloat: snapshot.openingFloat,
        organizationId: input.organizationId,
        paidInAmount: snapshot.paidInAmount,
        paidOutAmount: snapshot.paidOutAmount,
        varianceAmount,
      })
      .returning();
    const [closedSession] = await tx
      .update(cashDrawerSessions)
      .set({ closedAt: now, status: "CLOSED", updatedAt: now })
      .where(
        and(
          eq(cashDrawerSessions.id, session.id),
          eq(cashDrawerSessions.organizationId, input.organizationId),
          eq(cashDrawerSessions.status, "OPEN"),
        ),
      )
      .returning();

    if (!closedSession) {
      throw new CashDrawerReconciliationError(
        "The cash drawer changed while it was being closed. Refresh and try again.",
        409,
      );
    }

    return { reconciliation, session: closedSession };
  });

  await writeAuditLog({
    action: "cash_drawer.session.closed",
    actor: input.actor,
    entityId: result.session.id,
    entityType: "cash_drawer_session",
    organizationId: input.organizationId,
    metadata: {
      cashRefundsAmount: result.reconciliation.cashRefundsAmount,
      cashSalesAmount: result.reconciliation.cashSalesAmount,
      closingNote: result.reconciliation.closingNote,
      countedCashAmount: result.reconciliation.countedCashAmount,
      currency: result.reconciliation.currency,
      expectedCashAmount: result.reconciliation.expectedCashAmount,
      orderingPointId: input.orderingPointId,
      paidInAmount: result.reconciliation.paidInAmount,
      paidOutAmount: result.reconciliation.paidOutAmount,
      reconciliationId: result.reconciliation.id,
      varianceAmount: result.reconciliation.varianceAmount,
    },
  });

  return result;
}
