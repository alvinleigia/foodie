import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { getHomePathForRole } from "@/lib/role-access";

export default async function Home() {
  const session = await auth();

  if (session?.user?.role) {
    redirect(getHomePathForRole(session.user.role));
  }

  redirect("/order");
}
