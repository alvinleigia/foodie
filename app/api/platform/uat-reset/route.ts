import { NextResponse } from "next/server";
import { z } from "zod";

import { auth } from "@/auth";
import { canAccessRole, platformAdminRoles } from "@/lib/role-access";
import { isUatDatabaseResetEnabled, resetUatDatabase } from "@/lib/uat-reset";

const resetSchema = z.object({
  confirmationText: z.string(),
});

export async function POST(request: Request) {
  if (!isUatDatabaseResetEnabled()) {
    return NextResponse.json({ error: "UAT database reset is disabled." }, { status: 404 });
  }

  const session = await auth();

  if (
    !session?.user?.id ||
    !session.user.role ||
    !canAccessRole(session.user.role, platformAdminRoles)
  ) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const parsed = resetSchema.safeParse(await request.json());

  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  if (parsed.data.confirmationText.trim().toLowerCase() !== "reset") {
    return NextResponse.json(
      {
        error: {
          fieldErrors: {
            confirmationText: ['Type "reset" exactly to reset UAT data.'],
          },
          formErrors: [],
        },
      },
      { status: 400 },
    );
  }

  await resetUatDatabase(session.user.id);

  return NextResponse.json({
    message: "UAT database reset complete. Platform owner access was preserved.",
  });
}
