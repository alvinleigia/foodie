import { auth } from "@/auth";
import { CustomerOrderPage } from "@/components/order/CustomerOrderPage";
import { AppShell } from "@/components/shared/AppShell";

async function getOptionalUser() {
  try {
    const session = await auth();

    if (!session?.user?.role) {
      return null;
    }

    return {
      name: session.user.name,
      role: session.user.role,
    };
  } catch {
    return null;
  }
}

export default async function LocationOrderPage(
  props: PageProps<"/order/[locationSlug]">,
) {
  const params = await props.params;
  const user = await getOptionalUser();

  return (
    <AppShell topSpacing="compact" variant="dark" contentClassName="max-w-6xl space-y-6 pb-8">
      <CustomerOrderPage locationSlug={params.locationSlug} user={user} />
    </AppShell>
  );
}
