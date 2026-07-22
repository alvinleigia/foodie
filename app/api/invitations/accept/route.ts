import { NextResponse } from "next/server";
import { ZodError } from "zod";

import { acceptStaffInvitation } from "@/lib/invitations";
import {
  checkRateLimit,
  getRequestRateLimitKey,
  rateLimitResponse,
} from "@/lib/rate-limit";

export async function POST(request: Request) {
  try {
    const rateLimit = await checkRateLimit({
      key: getRequestRateLimitKey(request, "public:invite-accept"),
      limit: 10,
      windowMs: 10 * 60_000,
    });

    if (!rateLimit.allowed) {
      return rateLimitResponse(rateLimit);
    }

    await acceptStaffInvitation(await request.json());

    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json({ error: error.flatten() }, { status: 400 });
    }

    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to accept invitation." },
      { status: 400 },
    );
  }
}
