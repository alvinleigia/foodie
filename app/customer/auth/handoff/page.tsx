import { CustomerAuthHandoff } from "@/components/customer/CustomerAuthHandoff";
import { AppShell } from "@/components/shared/AppShell";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { getSafeCustomerReturnTo } from "@/lib/customer-navigation";

type CustomerAuthHandoffPageProps = {
  searchParams: Promise<{
    returnTo?: string | string[];
    token?: string | string[];
  }>;
};

export default async function CustomerAuthHandoffPage({
  searchParams,
}: CustomerAuthHandoffPageProps) {
  const params = await searchParams;
  const token = typeof params.token === "string" ? params.token : "";
  const returnTo = getSafeCustomerReturnTo(params.returnTo);

  return (
    <AppShell
      variant="neutral"
      contentClassName="flex min-h-[calc(100vh-5rem)] max-w-xl items-center"
    >
      <Card className="w-full rounded-xl border-stone-200 bg-white">
        <CardHeader className="px-6 pt-6">
          <h1 className="text-xl font-semibold text-stone-950">Completing sign-in</h1>
        </CardHeader>
        <CardContent className="px-6 pb-6">
          <CustomerAuthHandoff returnTo={returnTo} token={token} />
        </CardContent>
      </Card>
    </AppShell>
  );
}
