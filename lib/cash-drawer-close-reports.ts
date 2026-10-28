import "server-only";

import { aliasedTable, and, asc, count, eq, gte, lt, sql } from "drizzle-orm";

import { getDb } from "@/db";
import {
  cashDrawerMovements,
  cashDrawerReconciliations,
  cashDrawerSessions,
  orderPayments,
  orderRefunds,
  orderingPoints,
  orders,
  organizations,
  users,
} from "@/db/schema";
import {
  getBusinessDateRange,
  getCurrentBusinessDate,
} from "@/lib/business-date";
import { aggregateCashActivityTotals } from "@/lib/cash-drawer-close-report-calculations";
import type {
  CashDrawerCloseReport,
  CashDrawerLedgerEntry,
} from "@/lib/cash-drawer-close-report-types";

export class CashDrawerCloseReportError extends Error {
  status: number;

  constructor(message: string, status = 400) {
    super(message);
    this.name = "CashDrawerCloseReportError";
    this.status = status;
  }
}

type AmountRow = {
  amount: string;
  count: number;
  currency: string;
  method: string;
};

const openedByUsers = aliasedTable(users, "cash_drawer_opened_by_user");
const closedByUsers = aliasedTable(users, "cash_drawer_closed_by_user");

function normalizeAmountRows(rows: AmountRow[]) {
  return rows.map((row) => ({
    amount: row.amount,
    count: Number(row.count),
    currency: row.currency.trim().toUpperCase(),
    method: row.method,
  }));
}

export async function getCashDrawerCloseReport(input: {
  businessDate?: string;
  organizationId: string;
}): Promise<CashDrawerCloseReport> {
  const db = getDb();
  const [restaurant] = await db
    .select({
      currency: organizations.currency,
      name: organizations.name,
      timezone: organizations.timezone,
    })
    .from(organizations)
    .where(
      and(
        eq(organizations.id, input.organizationId),
        eq(organizations.type, "RESTAURANT"),
      ),
    )
    .limit(1);

  if (!restaurant) {
    throw new CashDrawerCloseReportError("Restaurant not found.", 404);
  }

  const businessDate =
    input.businessDate ?? getCurrentBusinessDate(restaurant.timezone);
  let range: ReturnType<typeof getBusinessDateRange>;

  try {
    range = getBusinessDateRange(businessDate, restaurant.timezone);
  } catch {
    throw new CashDrawerCloseReportError(
      "Choose a valid business date using YYYY-MM-DD.",
    );
  }

  const amountTotal = sql<string>`coalesce(sum(${orderPayments.amount}), 0)`;
  const refundTotal = sql<string>`coalesce(sum(${orderRefunds.amount}), 0)`;
  const [
    drawerSessions,
    openDrawers,
    payments,
    refunds,
    orderStatuses,
    sessionPayments,
    sessionRefunds,
    sessionMovements,
  ] =
    await Promise.all([
      db
        .select({
          cashRefundsAmount: cashDrawerReconciliations.cashRefundsAmount,
          cashSalesAmount: cashDrawerReconciliations.cashSalesAmount,
          closedAt: cashDrawerSessions.closedAt,
          closedByMembershipId:
            cashDrawerReconciliations.closedByMembershipId,
          closedByName: closedByUsers.name,
          closingNote: cashDrawerReconciliations.closingNote,
          countedCashAmount: cashDrawerReconciliations.countedCashAmount,
          currency: cashDrawerReconciliations.currency,
          expectedCashAmount: cashDrawerReconciliations.expectedCashAmount,
          id: cashDrawerReconciliations.id,
          openedAt: cashDrawerSessions.openedAt,
          openedByMembershipId: cashDrawerSessions.openedByMembershipId,
          openedByName: openedByUsers.name,
          openingFloat: cashDrawerReconciliations.openingFloat,
          orderingPointName: orderingPoints.name,
          paidInAmount: cashDrawerReconciliations.paidInAmount,
          paidOutAmount: cashDrawerReconciliations.paidOutAmount,
          sessionId: cashDrawerSessions.id,
          varianceAmount: cashDrawerReconciliations.varianceAmount,
        })
        .from(cashDrawerSessions)
        .innerJoin(
          cashDrawerReconciliations,
          and(
            eq(
              cashDrawerReconciliations.cashDrawerSessionId,
              cashDrawerSessions.id,
            ),
            eq(
              cashDrawerReconciliations.organizationId,
              cashDrawerSessions.organizationId,
            ),
          ),
        )
        .innerJoin(
          orderingPoints,
          and(
            eq(orderingPoints.id, cashDrawerSessions.orderingPointId),
            eq(
              orderingPoints.organizationId,
              cashDrawerSessions.organizationId,
            ),
          ),
        )
        .leftJoin(
          openedByUsers,
          eq(openedByUsers.id, cashDrawerSessions.openedByUserId),
        )
        .leftJoin(
          closedByUsers,
          eq(closedByUsers.id, cashDrawerReconciliations.closedByUserId),
        )
        .where(
          and(
            eq(cashDrawerSessions.organizationId, input.organizationId),
            eq(cashDrawerSessions.status, "CLOSED"),
            gte(cashDrawerSessions.closedAt, range.start),
            lt(cashDrawerSessions.closedAt, range.end),
          ),
        )
        .orderBy(asc(cashDrawerSessions.closedAt)),
      db
        .select({
          id: cashDrawerSessions.id,
          openedAt: cashDrawerSessions.openedAt,
          orderingPointName: orderingPoints.name,
        })
        .from(cashDrawerSessions)
        .innerJoin(
          orderingPoints,
          and(
            eq(orderingPoints.id, cashDrawerSessions.orderingPointId),
            eq(
              orderingPoints.organizationId,
              cashDrawerSessions.organizationId,
            ),
          ),
        )
        .where(
          and(
            eq(cashDrawerSessions.organizationId, input.organizationId),
            eq(cashDrawerSessions.status, "OPEN"),
          ),
        )
        .orderBy(asc(cashDrawerSessions.openedAt)),
      db
        .select({
          amount: amountTotal,
          count: count(),
          currency: orderPayments.currency,
          method: orderPayments.method,
        })
        .from(orderPayments)
        .where(
          and(
            eq(orderPayments.organizationId, input.organizationId),
            eq(orderPayments.status, "SUCCEEDED"),
            gte(orderPayments.completedAt, range.start),
            lt(orderPayments.completedAt, range.end),
          ),
        )
        .groupBy(orderPayments.method, orderPayments.currency),
      db
        .select({
          amount: refundTotal,
          count: count(),
          currency: orderRefunds.currency,
          method: orderRefunds.provider,
        })
        .from(orderRefunds)
        .where(
          and(
            eq(orderRefunds.organizationId, input.organizationId),
            eq(orderRefunds.status, "SUCCEEDED"),
            gte(orderRefunds.processedAt, range.start),
            lt(orderRefunds.processedAt, range.end),
          ),
        )
        .groupBy(orderRefunds.provider, orderRefunds.currency),
      db
        .select({ count: count(), status: orders.status })
        .from(orders)
        .where(
          and(
            eq(orders.organizationId, input.organizationId),
            gte(orders.createdAt, range.start),
            lt(orders.createdAt, range.end),
          ),
        )
        .groupBy(orders.status),
      db
        .select({
          amount: orderPayments.amount,
          changeAmount: orderPayments.changeAmount,
          completedAt: orderPayments.completedAt,
          createdAt: orderPayments.createdAt,
          currency: orderPayments.currency,
          id: orderPayments.id,
          orderNo: orders.orderNo,
          recordedByName: users.name,
          sessionId: orderPayments.cashDrawerSessionId,
          tenderedAmount: orderPayments.tenderedAmount,
        })
        .from(orderPayments)
        .innerJoin(
          cashDrawerSessions,
          and(
            eq(cashDrawerSessions.id, orderPayments.cashDrawerSessionId),
            eq(
              cashDrawerSessions.organizationId,
              orderPayments.organizationId,
            ),
          ),
        )
        .innerJoin(
          orders,
          and(
            eq(orders.id, orderPayments.orderId),
            eq(orders.organizationId, orderPayments.organizationId),
          ),
        )
        .leftJoin(users, eq(users.id, orderPayments.receivedByUserId))
        .where(
          and(
            eq(orderPayments.organizationId, input.organizationId),
            eq(orderPayments.method, "CASH"),
            eq(orderPayments.status, "SUCCEEDED"),
            eq(cashDrawerSessions.status, "CLOSED"),
            gte(cashDrawerSessions.closedAt, range.start),
            lt(cashDrawerSessions.closedAt, range.end),
          ),
        )
        .orderBy(asc(orderPayments.completedAt)),
      db
        .select({
          amount: orderRefunds.amount,
          currency: orderRefunds.currency,
          id: orderRefunds.id,
          orderNo: orders.orderNo,
          processedAt: orderRefunds.processedAt,
          recordedByName: users.name,
          requestedAt: orderRefunds.requestedAt,
          sessionId: orderRefunds.cashDrawerSessionId,
        })
        .from(orderRefunds)
        .innerJoin(
          cashDrawerSessions,
          and(
            eq(cashDrawerSessions.id, orderRefunds.cashDrawerSessionId),
            eq(
              cashDrawerSessions.organizationId,
              orderRefunds.organizationId,
            ),
          ),
        )
        .innerJoin(
          orders,
          and(
            eq(orders.id, orderRefunds.orderId),
            eq(orders.organizationId, orderRefunds.organizationId),
          ),
        )
        .leftJoin(users, eq(users.id, orderRefunds.requestedByUserId))
        .where(
          and(
            eq(orderRefunds.organizationId, input.organizationId),
            eq(orderRefunds.provider, "CASH"),
            eq(orderRefunds.status, "SUCCEEDED"),
            eq(cashDrawerSessions.status, "CLOSED"),
            gte(cashDrawerSessions.closedAt, range.start),
            lt(cashDrawerSessions.closedAt, range.end),
          ),
        )
        .orderBy(asc(orderRefunds.processedAt)),
      db
        .select({
          amount: cashDrawerMovements.amount,
          createdAt: cashDrawerMovements.createdAt,
          currency: cashDrawerMovements.currency,
          id: cashDrawerMovements.id,
          note: cashDrawerMovements.note,
          reason: cashDrawerMovements.reason,
          recordedByName: users.name,
          sessionId: cashDrawerMovements.cashDrawerSessionId,
          type: cashDrawerMovements.type,
        })
        .from(cashDrawerMovements)
        .innerJoin(
          cashDrawerSessions,
          and(
            eq(cashDrawerSessions.id, cashDrawerMovements.cashDrawerSessionId),
            eq(
              cashDrawerSessions.organizationId,
              cashDrawerMovements.organizationId,
            ),
          ),
        )
        .leftJoin(users, eq(users.id, cashDrawerMovements.recordedByUserId))
        .where(
          and(
            eq(cashDrawerMovements.organizationId, input.organizationId),
            eq(cashDrawerSessions.status, "CLOSED"),
            gte(cashDrawerSessions.closedAt, range.start),
            lt(cashDrawerSessions.closedAt, range.end),
          ),
        )
        .orderBy(asc(cashDrawerMovements.createdAt)),
    ]);

  const ledgerEntriesBySession = new Map<string, CashDrawerLedgerEntry[]>();
  const appendLedgerEntry = (
    sessionId: string | null,
    entry: CashDrawerLedgerEntry,
  ) => {
    if (!sessionId) {
      return;
    }

    const entries = ledgerEntriesBySession.get(sessionId) ?? [];
    entries.push(entry);
    ledgerEntriesBySession.set(sessionId, entries);
  };

  for (const payment of sessionPayments) {
    appendLedgerEntry(payment.sessionId, {
      amount: payment.amount,
      changeAmount: payment.changeAmount,
      currency: payment.currency,
      id: payment.id,
      kind: "CASH_PAYMENT",
      note: null,
      occurredAt: (payment.completedAt ?? payment.createdAt).toISOString(),
      orderNo: payment.orderNo,
      reason: null,
      recordedByName: payment.recordedByName,
      tenderedAmount: payment.tenderedAmount,
    });
  }

  for (const refund of sessionRefunds) {
    appendLedgerEntry(refund.sessionId, {
      amount: refund.amount,
      changeAmount: null,
      currency: refund.currency,
      id: refund.id,
      kind: "CASH_REFUND",
      note: null,
      occurredAt: (refund.processedAt ?? refund.requestedAt).toISOString(),
      orderNo: refund.orderNo,
      reason: null,
      recordedByName: refund.recordedByName,
      tenderedAmount: null,
    });
  }

  for (const movement of sessionMovements) {
    appendLedgerEntry(movement.sessionId, {
      amount: movement.amount,
      changeAmount: null,
      currency: movement.currency,
      id: movement.id,
      kind: movement.type,
      note: movement.note,
      occurredAt: movement.createdAt.toISOString(),
      orderNo: null,
      reason: movement.reason,
      recordedByName: movement.recordedByName,
      tenderedAmount: null,
    });
  }

  for (const entries of ledgerEntriesBySession.values()) {
    entries.sort(
      (left, right) =>
        new Date(left.occurredAt).getTime() -
        new Date(right.occurredAt).getTime(),
    );
  }

  return {
    businessDate,
    cashActivityTotals: aggregateCashActivityTotals(drawerSessions),
    currency: restaurant.currency.trim().toUpperCase(),
    drawerSessions: drawerSessions.map((session) => ({
      ...session,
      closedAt: session.closedAt?.toISOString() ?? null,
      ledgerEntries: ledgerEntriesBySession.get(session.sessionId) ?? [],
      openedAt: session.openedAt.toISOString(),
    })),
    generatedAt: new Date().toISOString(),
    isReadyToClose: openDrawers.length === 0,
    openDrawers: openDrawers.map((drawer) => ({
      ...drawer,
      openedAt: drawer.openedAt.toISOString(),
    })),
    orderStatuses: orderStatuses.map((row) => ({
      count: Number(row.count),
      status: row.status,
    })),
    payments: normalizeAmountRows(payments),
    refunds: normalizeAmountRows(refunds),
    restaurantName: restaurant.name,
    timezone: restaurant.timezone,
  };
}

function csvCell(value: string | number | null) {
  const text = value == null ? "" : String(value);
  return `"${text.replaceAll('"', '""')}"`;
}

function csvRow(values: Array<string | number | null>) {
  return values.map(csvCell).join(",");
}

export function exportCashDrawerCloseReportCsv(
  report: Awaited<ReturnType<typeof getCashDrawerCloseReport>>,
) {
  return [
    csvRow(["Restaurant", report.restaurantName]),
    csvRow(["Business date", report.businessDate]),
    csvRow(["Timezone", report.timezone]),
    csvRow(["Ready to close", report.isReadyToClose ? "Yes" : "No"]),
    csvRow(["Open drawers", report.openDrawers.length]),
    "",
    csvRow(["Drawer sessions"]),
    csvRow([
      "Ordering point",
      "Opened",
      "Closed",
      "Opened by",
      "Closed by",
      "Currency",
      "Opening float",
      "Cash sales",
      "Cash refunds",
      "Paid in",
      "Paid out",
      "Expected",
      "Counted",
      "Variance",
      "Closing note",
    ]),
    ...report.drawerSessions.map((session) =>
      csvRow([
        session.orderingPointName,
        session.openedAt,
        session.closedAt,
        session.openedByName,
        session.closedByName,
        session.currency,
        session.openingFloat,
        session.cashSalesAmount,
        session.cashRefundsAmount,
        session.paidInAmount,
        session.paidOutAmount,
        session.expectedCashAmount,
        session.countedCashAmount,
        session.varianceAmount,
        session.closingNote,
      ]),
    ),
    "",
    csvRow(["Drawer session ledger"]),
    csvRow([
      "Session ID",
      "Ordering point",
      "Time",
      "Entry type",
      "Order number",
      "Reason",
      "Note",
      "Recorded by",
      "Currency",
      "Amount",
      "Tendered",
      "Change",
    ]),
    ...report.drawerSessions.flatMap((session) =>
      session.ledgerEntries.map((entry) =>
        csvRow([
          session.sessionId,
          session.orderingPointName,
          entry.occurredAt,
          entry.kind,
          entry.orderNo,
          entry.reason,
          entry.note,
          entry.recordedByName,
          entry.currency,
          entry.amount,
          entry.tenderedAmount,
          entry.changeAmount,
        ]),
      ),
    ),
    "",
    csvRow(["Payment totals"]),
    csvRow(["Method", "Currency", "Transactions", "Amount"]),
    ...report.payments.map((payment) =>
      csvRow([
        payment.method,
        payment.currency,
        payment.count,
        payment.amount,
      ]),
    ),
    "",
    csvRow(["Refund totals"]),
    csvRow(["Provider", "Currency", "Refunds", "Amount"]),
    ...report.refunds.map((refund) =>
      csvRow([refund.method, refund.currency, refund.count, refund.amount]),
    ),
    "",
    csvRow(["Order status"]),
    csvRow(["Status", "Orders"]),
    ...report.orderStatuses.map((status) =>
      csvRow([status.status, status.count]),
    ),
  ].join("\r\n");
}
