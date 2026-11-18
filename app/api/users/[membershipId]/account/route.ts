import { z, ZodError } from "zod";
import { NextResponse } from "next/server";

import { requireRole, requireStaffPermission } from "@/lib/auth";
import { writeAuditLog } from "@/lib/audit-log";
import { updateUserAccountForEditor } from "@/lib/user-account";
import { AccountDeletionError, deleteUserAccount } from "@/lib/user-account-deletion";
import { logError } from "@/lib/logger";

export async function DELETE(
  request: Request,
  context: { params: Promise<{ membershipId: string }> },
) {
  const session = await requireRole(["PLATFORM_ADMIN", "COMPANY_OWNER"]);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const { membershipId } = await context.params;
    const id = z.string().uuid().parse(membershipId);
    const { confirmationEmail } = z.object({ confirmationEmail: z.string().trim().email() }).parse(await request.json());
    const result = await deleteUserAccount({ membershipId: id, confirmationEmail, editor: session.user });
    if (!result) return NextResponse.json({ error: "User account not found for this access scope." }, { status: 404 });
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof AccountDeletionError) return NextResponse.json({ error: error.message }, { status: error.status });
    if (error instanceof ZodError || error instanceof SyntaxError) {
      return NextResponse.json({ error: "Provide a valid membership and confirmation email address." }, { status: 400 });
    }
    logError("user.account.delete_failed", error);
    return NextResponse.json({ error: "Account could not be deleted. Please try again." }, { status: 500 });
  }
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ membershipId: string }> },
) {
  const session = await requireStaffPermission("staff.manage");

  if (!session?.user?.role) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { membershipId } = await context.params;
    const result = await updateUserAccountForEditor({
      membershipId,
      editor: session.user,
      input: await request.json(),
    });

    await writeAuditLog({
      actor: session.user,
      organizationId: result.target.organizationId,
      action: "user.account.update",
      entityType: "user",
      entityId: result.user.id,
      metadata: {
        membershipId,
        previous: result.previous,
        next: {
          username: result.user.username,
          name: result.user.name,
          email: result.user.email,
        },
      },
    });

    return NextResponse.json({ user: result.user });
  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json({ error: error.flatten() }, { status: 400 });
    }

    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Failed to update account.",
      },
      { status: 400 },
    );
  }
}
