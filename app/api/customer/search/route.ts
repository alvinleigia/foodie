import { NextResponse } from "next/server";

import { requireStaffSession } from "@/lib/auth";
import { searchCustomersForStaff } from "@/lib/customer-account";
import {
  getStaffTenantContextFromRequest,
  StaffRestaurantContextError,
} from "@/lib/tenant-context";

export async function GET(request: Request) {
  const session = await requireStaffSession();

  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const query = new URL(request.url).searchParams.get("q")?.trim() ?? "";

  if (query.length < 2 || query.length > 100) {
    return NextResponse.json(
      { error: "Enter at least two characters to search." },
      { status: 400 },
    );
  }

  try {
    const customers = await searchCustomersForStaff(
      query,
      await getStaffTenantContextFromRequest(request),
    );

    return NextResponse.json({ customers });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Customers could not be searched." },
      { status: error instanceof StaffRestaurantContextError ? error.status : 500 },
    );
  }
}
