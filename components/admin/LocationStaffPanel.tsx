import Link from "next/link";

import { StaffInviteForm } from "@/components/admin/StaffInviteForm";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";

type LocationStaffPanelProps = {
  assignHref: string;
  backHref: string;
  locationId: string;
  locationName: string;
  restaurantId: string;
};

export function LocationStaffPanel({
  assignHref,
  backHref,
  locationId,
  locationName,
  restaurantId,
}: LocationStaffPanelProps) {
  return (
    <div className="grid gap-6">
      <Card className="rounded-xl border-stone-200 bg-white">
        <CardHeader className="px-5 pt-5">
          <h3 className="text-xl font-semibold text-stone-950">
            Existing staff
          </h3>
          <p className="text-sm text-stone-500">
            Assign an accepted user to {locationName}, or invite a new person below.
          </p>
        </CardHeader>
        <CardContent className="px-5 pb-5">
          <Button asChild variant="outline" className="rounded-lg">
            <Link href={assignHref}>Assign Existing Staff</Link>
          </Button>
        </CardContent>
      </Card>

      <StaffInviteForm
        apiPath={`/api/company/restaurants/${restaurantId}/locations/${locationId}/staff`}
        assignExistingHref={assignHref}
        backHref={backHref}
        backLabel="Back to locations"
        defaultRole="RESTAURANT_MANAGER"
        description={`Invite a manager or operator specifically to ${locationName}.`}
        roles={[
          { label: "Restaurant Manager", value: "RESTAURANT_MANAGER" },
          { label: "Order Operator", value: "ORDER_OPERATOR" },
        ]}
        title="Invite staff"
      />
    </div>
  );
}
