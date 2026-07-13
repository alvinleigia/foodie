import { NextResponse } from "next/server";

import { requireCustomerSession } from "@/lib/auth";
import {
  getCustomerProfile,
  updateCustomerProfile,
} from "@/lib/customer-account";
import { customerProfileUpdateSchema } from "@/lib/validations/customer";

export async function GET() {
  const session = await requireCustomerSession();

  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const customer = await getCustomerProfile(session.user.id);

  if (!customer) {
    return NextResponse.json({ error: "Customer profile not found." }, { status: 404 });
  }

  return NextResponse.json({ customer });
}

export async function PATCH(request: Request) {
  const session = await requireCustomerSession();

  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const parsed = customerProfileUpdateSchema.safeParse(await request.json());

  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const customer = await updateCustomerProfile(session.user.id, parsed.data);

  if (!customer) {
    return NextResponse.json({ error: "Customer profile not found." }, { status: 404 });
  }

  return NextResponse.json({ customer });
}
