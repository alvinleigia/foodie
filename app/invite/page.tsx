import { AppShell } from "@/components/shared/AppShell";
import { InviteAcceptForm } from "@/components/admin/InviteAcceptForm";
import { getStaffInvitationDetails } from "@/lib/invitations";

export default async function InvitePage(props: PageProps<"/invite">) {
  const searchParams = await props.searchParams;
  const tokenValue = searchParams.token;
  const token = typeof tokenValue === "string" ? tokenValue : "";
  const invitation = token ? await getStaffInvitationDetails(token) : null;

  return (
    <AppShell contentClassName="max-w-xl">
      <InviteAcceptForm invitation={invitation} token={token} />
    </AppShell>
  );
}
