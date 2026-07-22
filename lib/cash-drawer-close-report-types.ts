export type CashDrawerReportAmount = {
  amount: string;
  count: number;
  currency: string;
  method: string;
};

export type CashDrawerCloseReport = {
  businessDate: string;
  cashTotals: Array<{
    cashRefundsAmount: string;
    cashSalesAmount: string;
    countedCashAmount: string;
    currency: string;
    expectedCashAmount: string;
    openingFloat: string;
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
  shifts: Array<{
    cashRefundsAmount: string;
    cashSalesAmount: string;
    closedAt: string | null;
    closedByMembershipId: string | null;
    closingNote: string | null;
    countedCashAmount: string;
    currency: string;
    expectedCashAmount: string;
    id: string;
    openedAt: string;
    openedByMembershipId: string | null;
    openingFloat: string;
    orderingPointName: string;
    paidInAmount: string;
    paidOutAmount: string;
    sessionId: string;
    varianceAmount: string;
  }>;
  timezone: string;
};
