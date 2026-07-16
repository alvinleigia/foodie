import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { SocialLoginStart } from "@/components/customer/SocialLoginStart";
import { CustomerSocialAuthProvider } from "@/components/customer/CustomerSocialAuthProvider";
import { AppShell } from "@/components/shared/AppShell";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import {
  customerOAuthContextCookieName,
  parseCustomerOAuthContextValue,
} from "@/lib/customer-oauth-context";

type CustomerSocialAuthPageProps = {
  searchParams: Promise<{ error?: string | string[] }>;
};

export default async function CustomerSocialAuthPage({
  searchParams,
}: CustomerSocialAuthPageProps) {
  const params = await searchParams;
  const cookieStore = await cookies();
  const context = parseCustomerOAuthContextValue(
    cookieStore.get(customerOAuthContextCookieName)?.value,
  );

  if (!context) {
    redirect("/");
  }

  return (
    <AppShell
      variant="neutral"
      contentClassName="flex min-h-[calc(100vh-5rem)] max-w-xl items-center"
    >
      <Card className="w-full rounded-xl border-stone-200 bg-white">
        <CardHeader className="px-6 pt-6">
          <h1 className="text-xl font-semibold text-stone-950">Secure sign-in</h1>
        </CardHeader>
        <CardContent className="px-6 pb-6">
          {params.error ? (
            <p className="text-sm text-rose-600">
              Sign-in was not completed. Return to the restaurant and try again.
            </p>
          ) : (
            <CustomerSocialAuthProvider>
              <SocialLoginStart provider={context.provider} />
            </CustomerSocialAuthProvider>
          )}
        </CardContent>
      </Card>
    </AppShell>
  );
}
