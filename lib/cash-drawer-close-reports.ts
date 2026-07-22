import "server-only";

import { and, asc, count, eq, gte, lt, sql } from "drizzle-orm";

import { getDb } from "@/db";
import {
  cashDrawerReconciliations,
  cashDrawerSessions,
  orderPayments,
  orderRefunds,
  orderingPoints,
  orders,
  organizations,
} from "@/db/schema";
import {
  getBusinessDateRange,
  getCurrentBusinessDate,
} from "@/lib/business-date";
import {
  decimalToMinorUnits,
  minorUnitsToDecimal,
} from "@/lib/currency-money";
import type { CashDrawerCloseReport } from "@/lib/cash-drawer-close-report-types";

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

function aggregateCashTotals(
  shifts: Array<{
    cashRefundsAmount: string;
    cashSalesAmount: string;
    countedCashAmount: string;
    currency: string;
    expectedCashAmount: string;
    openingFloat: string;
    paidInAmount: string;
    paidOutAmount: string;
    varianceAmount: string;
  }>,
) {
  const totals = new Map<
    string,
    {
      cashRefundsMinor: number;
      cashSalesMinor: number;
      countedCashMinor: number;
      expectedCashMinor: number;
      openingFloatMinor: number;
      paidInMinor: number;
      paidOutMinor: number;
      varianceMinor: number;
    }
  >();

  for (const shift of shifts) {
    const currency = shift.currency.trim().toUpperCase();
    const current = totals.get(currency) ?? {
      cashRefundsMinor: 0,
      cashSalesMinor: 0,
      countedCashMinor: 0,
      expectedCashMinor: 0,
      openingFloatMinor: 0,
      paidInMinor: 0,
      paidOutMinor: 0,
      varianceMinor: 0,
    };

    current.cashRefundsMinor += decimalToMinorUnits(
      shift.cashRefundsAmount,
      currency,
    );
    current.cashSalesMinor += decimalToMinorUnits(
      shift.cashSalesAmount,
      currency,
    );
    current.countedCashMinor += decimalToMinorUnits(
      shift.countedCashAmount,
      currency,
    );
    current.expectedCashMinor += decimalToMinorUnits(
      shift.expectedCashAmount,
      currency,
    );
    current.openingFloatMinor += decimalToMinorUnits(
      shift.openingFloat,
      currency,
    );
    current.paidInMinor += decimalToMinorUnits(shift.paidInAmount, currency);
    current.paidOutMinor += decimalToMinorUnits(shift.paidOutAmount, currency);
    current.varianceMinor += decimalToMinorUnits(
      shift.varianceAmount,
      currency,
    );
    totals.set(currency, current);
  }

  return [...totals.entries()].map(([currency, total]) => ({
    cashRefundsAmount: minorUnitsToDecimal(total.cashRefundsMinor, currency),
    cashSalesAmount: minorUnitsToDecimal(total.cashSalesMinor, currency),
    countedCashAmount: minorUnitsToDecimal(total.countedCashMinor, currency),
    currency,
    expectedCashAmount: minorUnitsToDecimal(total.expectedCashMinor, currency),
    openingFloat: minorUnitsToDecimal(total.openingFloatMinor, currency),
    paidInAmount: minorUnitsToDecimal(total.paidInMinor, currency),
    paidOutAmount: minorUnitsToDecimal(total.paidOutMinor, currency),
    varianceAmount: minorUnitsToDecimal(total.varianceMinor, currency),
  }));
}

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
  const [shifts, openDrawers, payments, refunds, orderStatuses] =
    await Promise.all([
      db
        .select({
          cashRefundsAmount: cashDrawerReconciliations.cashRefundsAmount,
          cashSalesAmount: cashDrawerReconciliations.cashSalesAmount,
          closedAt: cashDrawerSessions.closedAt,
          closedByMembershipId:
            cashDrawerReconciliations.closedByMembershipId,
          closingNote: cashDrawerReconciliations.closingNote,
          countedCashAmount: cashDrawerReconciliations.countedCashAmount,
          currency: cashDrawerReconciliations.currency,
          expectedCashAmount: cashDrawerReconciliations.expectedCashAmount,
          id: cashDrawerReconciliations.id,
          openedAt: cashDrawerSessions.openedAt,
          openedByMembershipId: cashDrawerSessions.openedByMembershipId,
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
    ]);

  return {
    businessDate,
    cashTotals: aggregateCashTotals(shifts),
    currency: restaurant.currency.trim().toUpperCase(),
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
    shifts: shifts.map((shift) => ({
      ...shift,
      closedAt: shift.closedAt?.toISOString() ?? null,
      openedAt: shift.openedAt.toISOString(),
    })),
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
    csvRow(["Shift closes"]),
    csvRow([
      "Ordering point",
      "Opened",
      "Closed",
      "Currency",
      "Cash sales",
      "Cash refunds",
      "Paid in",
      "Paid out",
      "Expected",
      "Counted",
      "Variance",
      "Closing note",
    ]),
    ...report.shifts.map((shift) =>
      csvRow([
        shift.orderingPointName,
        shift.openedAt,
        shift.closedAt,
        shift.currency,
        shift.cashSalesAmount,
        shift.cashRefundsAmount,
        shift.paidInAmount,
        shift.paidOutAmount,
        shift.expectedCashAmount,
        shift.countedCashAmount,
        shift.varianceAmount,
        shift.closingNote,
      ]),
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
