export type CashDrawerReportAmount = {
  amount: string;
  count: number;
  currency: string;
  method: string;
};

export type CashDrawerLedgerEntry = {
  amount: string;
  changeAmount: string | null;
  currency: string;
  id: string;
  kind: "CASH_PAYMENT" | "CASH_REFUND" | "PAID_IN" | "PAID_OUT";
  note: string | null;
  occurredAt: string;
  orderNo: number | null;
  reason: string | null;
  recordedByName: string | null;
  tenderedAmount: string | null;
};

export type CashDrawerCloseReport = {
  businessDate: string;
  cashActivityTotals: Array<{
    cashRefundsAmount: string;
    cashSalesAmount: string;
    currency: string;
    netCashMovementAmount: string;
    paidInAmount: string;
    paidOutAmount: string;
    varianceAmount: string;
  }>;
  currency: string;
  generatedAt: string;
  isReadyToClose: boolean;
  openDrawers: Array<{
    id: string;
    openedAt: string;
    orderingPointName: string;
  }>;
  orderStatuses: Array<{
    count: number;
    status: string;
  }>;
  payments: CashDrawerReportAmount[];
  refunds: CashDrawerReportAmount[];
  restaurantName: string;
  drawerSessions: Array<{
    cashRefundsAmount: string;
    cashSalesAmount: string;
    closedAt: string | null;
    closedByMembershipId: string | null;
    closedByName: string | null;
    closingNote: string | null;
    countedCashAmount: string;
    currency: string;
    expectedCashAmount: string;
    id: string;
    ledgerEntries: CashDrawerLedgerEntry[];
    openedAt: string;
    openedByMembershipId: string | null;
    openedByName: string | null;
    openingFloat: string;
    orderingPointName: string;
    paidInAmount: string;
    paidOutAmount: string;
    sessionId: string;
    varianceAmount: string;
  }>;
  timezone: string;
};
