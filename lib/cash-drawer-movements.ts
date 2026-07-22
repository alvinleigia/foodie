import "server-only";

import { and, desc, eq } from "drizzle-orm";

import { getDb } from "@/db";
import { cashDrawerMovements, cashDrawerSessions, users } from "@/db/schema";
import { writeAuditLog } from "@/lib/audit-log";
import {
  isCashDrawerMovementReason,
  type CashDrawerMovementType,
} from "@/lib/cash-drawer-movement-reasons";
import {
  decimalToMinorUnits,
  minorUnitsToDecimal,
} from "@/lib/currency-money";
import type { MembershipRole } from "@/lib/staff-auth";

type CashDrawerMovementActor = {
  id: string;
  membershipId: string;
  name?: string | null;
  organizationId: string;
  role: MembershipRole;
  username?: string;
};

type RecordCashDrawerMovementInput = {
  actor: CashDrawerMovementActor;
  amount: string;
  note?: string;
  orderingPointId: string;
  organizationId: string;
  reason: string;
  type: CashDrawerMovementType;
};

export class CashDrawerMovementError extends Error {
  status: number;

  constructor(message: string, status = 400) {
    super(message);
    this.name = "CashDrawerMovementError";
    this.status = status;
  }
}

function normalizeMovementAmount(value: string, currency: string) {
  try {
    const amountMinor = decimalToMinorUnits(value, currency);

    if (amountMinor <= 0) {
      throw new Error("Cash movement amount must be positive.");
    }

    return minorUnitsToDecimal(amountMinor, currency);
  } catch {
    throw new CashDrawerMovementError(
      "Enter a valid cash amount greater than zero.",
    );
  }
}

export async function listOpenCashDrawerMovements(input: {
  orderingPointId: string;
  organizationId: string;
}) {
  const [openSession] = await getDb()
    .select({ id: cashDrawerSessions.id })
    .from(cashDrawerSessions)
    .where(
      and(
        eq(cashDrawerSessions.organizationId, input.organizationId),
        eq(cashDrawerSessions.orderingPointId, input.orderingPointId),
        eq(cashDrawerSessions.status, "OPEN"),
      ),
    )
    .limit(1);

  if (!openSession) {
    return [];
  }

  return getDb()
    .select({
      amount: cashDrawerMovements.amount,
      createdAt: cashDrawerMovements.createdAt,
      currency: cashDrawerMovements.currency,
      id: cashDrawerMovements.id,
      note: cashDrawerMovements.note,
      reason: cashDrawerMovements.reason,
      recordedByName: users.name,
      type: cashDrawerMovements.type,
    })
    .from(cashDrawerMovements)
    .leftJoin(users, eq(users.id, cashDrawerMovements.recordedByUserId))
    .where(
      and(
        eq(cashDrawerMovements.organizationId, input.organizationId),
        eq(cashDrawerMovements.cashDrawerSessionId, openSession.id),
      ),
    )
    .orderBy(desc(cashDrawerMovements.createdAt))
    .limit(100);
}

export async function recordCashDrawerMovement(
  input: RecordCashDrawerMovementInput,
) {
  const reason = input.reason.trim();
  const note = input.note?.trim() || null;

  if (!isCashDrawerMovementReason(input.type, reason)) {
    throw new CashDrawerMovementError(
      "Choose a valid reason for this cash movement.",
    );
  }

  const movement = await getDb().transaction(async (tx) => {
    const [openSession] = await tx
      .select()
      .from(cashDrawerSessions)
      .where(
        and(
          eq(cashDrawerSessions.organizationId, input.organizationId),
          eq(cashDrawerSessions.orderingPointId, input.orderingPointId),
          eq(cashDrawerSessions.status, "OPEN"),
        ),
      )
      .limit(1)
      .for("update");

    if (!openSession) {
      throw new CashDrawerMovementError(
        "Open the cash drawer before recording a cash movement.",
        409,
      );
    }

    const amount = normalizeMovementAmount(input.amount, openSession.currency);
    const [createdMovement] = await tx
      .insert(cashDrawerMovements)
      .values({
        amount,
        cashDrawerSessionId: openSession.id,
        currency: openSession.currency,
        note,
        organizationId: input.organizationId,
        reason,
        recordedByMembershipId: input.actor.membershipId,
        recordedByUserId: input.actor.id,
        type: input.type,
      })
      .returning();

    return createdMovement;
  });

  await writeAuditLog({
    action: `cash_drawer.movement.${input.type.toLowerCase()}`,
    actor: input.actor,
    entityId: movement.id,
    entityType: "cash_drawer_movement",
    organizationId: input.organizationId,
    metadata: {
      amount: movement.amount,
      cashDrawerSessionId: movement.cashDrawerSessionId,
      currency: movement.currency,
      note: movement.note,
      orderingPointId: input.orderingPointId,
      reason: movement.reason,
      type: movement.type,
    },
  });

  return {
    ...movement,
    recordedByName: input.actor.name ?? input.actor.username ?? null,
  };
}
