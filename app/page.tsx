import { notFound, redirect } from "next/navigation";

import { auth } from "@/auth";
import { resolveStaffHomePath } from "@/lib/staff-home";

export default async function Home() {
  const session = await auth();

  if (session?.user.kind === "staff") {
    const homePath = await resolveStaffHomePath(session.user);

    if (!homePath) {
      notFound();
    }

    redirect(homePath);
  }

  redirect("/order");
}
