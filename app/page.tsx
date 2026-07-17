import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { getHomePathForRole } from "@/lib/role-access";
import { resolveStaffHomePath } from "@/lib/staff-home";

export default async function Home() {
  const session = await auth();

  if (session?.user.kind === "staff") {
    redirect(
      (await resolveStaffHomePath(session.user)) ??
        getHomePathForRole(session.user.role),
    );
  }

  redirect("/order");
}
