import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { MixologistAdminWorkspace } from "@/components/mixologist/MixologistAdminWorkspace";
import { SignOutButton } from "@/components/mixologist/SignOutButton";
import { AppShell } from "@/components/shared/AppShell";

export default async function MixologistPage() {
  const session = await auth();

  if (session?.user?.role !== "MIXOLOGIST") {
    redirect("/mixologist/login");
  }

  return (
    <AppShell variant="dark">
      <div className="mb-4 flex items-center justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.25em] text-stone-400">
            Signed in as
          </p>
          <p className="mt-1 text-sm text-stone-200">
            {session.user.name ?? "Mixologist"}
          </p>
        </div>
        <SignOutButton />
      </div>
      <MixologistAdminWorkspace />
    </AppShell>
  );
}
