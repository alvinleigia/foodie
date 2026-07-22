import { and, eq } from "drizzle-orm";

import { getDb } from "@/db";
import {
  cashDrawerSessions,
  orderingPoints,
  organizations,
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

type OpenCashDrawerSessionInput = {
  actor: CashDrawerActor;
  openingFloat: string;
  orderingPointId: string;
  organizationId: string;
};

export async function getCashDrawerOpeningContext(input: {
  orderingPointId: string;
  organizationId: string;
}) {
  const [orderingPoint] = await getDb()
    .select({
      currency: organizations.currency,
      id: orderingPoints.id,
      name: orderingPoints.name,
      timezone: organizations.timezone,
    })
    .from(orderingPoints)
    .innerJoin(organizations, eq(organizations.id, orderingPoints.organizationId))
    .where(
      and(
        eq(orderingPoints.id, input.orderingPointId),
        eq(orderingPoints.organizationId, input.organizationId),
        eq(orderingPoints.isActive, true),
        eq(organizations.id, input.organizationId),
        eq(organizations.type, "RESTAURANT"),
        eq(organizations.isActive, true),
      ),
    )
    .limit(1);

  if (!orderingPoint) {
    throw new CashDrawerSessionError("Ordering point not found.", 404);
  }

  return {
    ...orderingPoint,
    currency: orderingPoint.currency.trim().toUpperCase(),
  };
}

export class CashDrawerSessionError extends Error {
  status: number;

  constructor(message: string, status = 400) {
    super(message);
    this.name = "CashDrawerSessionError";
    this.status = status;
  }
}

function isUniqueViolation(error: unknown) {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "23505"
  );
}

export function normalizeOpeningFloat(value: string, currency: string) {
  try {
    const amountMinor = decimalToMinorUnits(value, currency);

    if (amountMinor < 0) {
      throw new Error("Opening float cannot be negative.");
    }

    return minorUnitsToDecimal(amountMinor, currency);
  } catch {
    throw new CashDrawerSessionError(
      "Enter a valid opening float greater than or equal to zero.",
    );
  }
}

export async function getOpenCashDrawerSession(input: {
  orderingPointId: string;
  organizationId: string;
}) {
  const [session] = await getDb()
    .select({
      id: cashDrawerSessions.id,
      currency: cashDrawerSessions.currency,
      openedAt: cashDrawerSessions.openedAt,
      openedByMembershipId: cashDrawerSessions.openedByMembershipId,
      openedByUserId: cashDrawerSessions.openedByUserId,
      openingFloat: cashDrawerSessions.openingFloat,
      orderingPointId: cashDrawerSessions.orderingPointId,
      orderingPointName: orderingPoints.name,
      status: cashDrawerSessions.status,
    })
    .from(cashDrawerSessions)
    .innerJoin(
      orderingPoints,
      and(
        eq(orderingPoints.id, cashDrawerSessions.orderingPointId),
        eq(orderingPoints.organizationId, cashDrawerSessions.organizationId),
      ),
    )
    .where(
      and(
        eq(cashDrawerSessions.organizationId, input.organizationId),
        eq(cashDrawerSessions.orderingPointId, input.orderingPointId),
        eq(cashDrawerSessions.status, "OPEN"),
      ),
    )
    .limit(1);

  return session ?? null;
}

export async function openCashDrawerSession(
  input: OpenCashDrawerSessionInput,
) {
  const orderingPoint = await getCashDrawerOpeningContext({
    orderingPointId: input.orderingPointId,
    organizationId: input.organizationId,
  });

  const openingFloat = normalizeOpeningFloat(
    input.openingFloat,
    orderingPoint.currency,
  );

  let session: typeof cashDrawerSessions.$inferSelect;

  try {
    const [createdSession] = await getDb()
      .insert(cashDrawerSessions)
      .values({
        currency: orderingPoint.currency,
        openedByMembershipId: input.actor.membershipId,
        openedByUserId: input.actor.id,
        openingFloat,
        orderingPointId: orderingPoint.id,
        organizationId: input.organizationId,
      })
      .returning();

    session = createdSession;
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw new CashDrawerSessionError(
        "This ordering point already has an open cash drawer.",
        409,
      );
    }

    throw error;
  }

  await writeAuditLog({
    action: "cash_drawer.session.opened",
    actor: input.actor,
    entityId: session.id,
    entityType: "cash_drawer_session",
    organizationId: input.organizationId,
    metadata: {
      currency: session.currency,
      openingFloat: session.openingFloat,
      orderingPointId: session.orderingPointId,
      orderingPointName: orderingPoint.name,
    },
  });

  return {
    ...session,
    orderingPointName: orderingPoint.name,
  };
}
