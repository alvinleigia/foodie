import {
  decimalToMinorUnits,
  minorUnitsToDecimal,
} from "@/lib/currency-money";

export type CashDrawerSessionActivity = {
  cashRefundsAmount: string;
  cashSalesAmount: string;
  currency: string;
  paidInAmount: string;
  paidOutAmount: string;
  varianceAmount: string;
};

export function aggregateCashActivityTotals(
  sessions: CashDrawerSessionActivity[],
) {
  const totals = new Map<
    string,
    {
      cashRefundsMinor: number;
      cashSalesMinor: number;
      paidInMinor: number;
      paidOutMinor: number;
      varianceMinor: number;
    }
  >();

  for (const session of sessions) {
    const currency = session.currency.trim().toUpperCase();
    const current = totals.get(currency) ?? {
      cashRefundsMinor: 0,
      cashSalesMinor: 0,
      paidInMinor: 0,
      paidOutMinor: 0,
      varianceMinor: 0,
    };

    current.cashRefundsMinor += decimalToMinorUnits(
      session.cashRefundsAmount,
      currency,
    );
    current.cashSalesMinor += decimalToMinorUnits(
      session.cashSalesAmount,
      currency,
    );
    current.paidInMinor += decimalToMinorUnits(session.paidInAmount, currency);
    current.paidOutMinor += decimalToMinorUnits(
      session.paidOutAmount,
      currency,
    );
    current.varianceMinor += decimalToMinorUnits(
      session.varianceAmount,
      currency,
    );
    totals.set(currency, current);
  }

  return [...totals.entries()].map(([currency, total]) => ({
    cashRefundsAmount: minorUnitsToDecimal(
      total.cashRefundsMinor,
      currency,
    ),
    cashSalesAmount: minorUnitsToDecimal(total.cashSalesMinor, currency),
    currency,
    netCashMovementAmount: minorUnitsToDecimal(
      total.cashSalesMinor +
        total.paidInMinor -
        total.cashRefundsMinor -
        total.paidOutMinor,
      currency,
    ),
    paidInAmount: minorUnitsToDecimal(total.paidInMinor, currency),
    paidOutAmount: minorUnitsToDecimal(total.paidOutMinor, currency),
    varianceAmount: minorUnitsToDecimal(total.varianceMinor, currency),
  }));
}
