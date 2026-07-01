import { redirect } from "next/navigation";
import Link from "next/link";
import { ExternalLinkIcon, MapPinIcon, PencilIcon } from "lucide-react";

import { SaasAdminShell } from "@/components/admin/SaasAdminShell";
import { ButtonLabel } from "@/components/shared/ButtonLabel";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { requireRestaurantAdminPage } from "@/lib/restaurant-admin-page";

export default async function RestaurantLocationPage() {
  const { session, snapshot } = await requireRestaurantAdminPage();

  if (!snapshot.location) {
    redirect("/restaurant");
  }

  return (
    <SaasAdminShell
      activePath="/restaurant/location"
      eyebrow="Location"
      title="Locations"
      description="Review and manage the active operating location for this restaurant."
      user={{
        locationId: session.user.locationId,
        name: session.user.name,
        organizationId: session.user.organizationId,
        role: session.user.role,
      }}
    >
      <Card className="rounded-xl border-stone-200 bg-white">
        <CardHeader className="flex flex-row items-start justify-between gap-4 px-5 pt-5">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[rgb(199,76,0)]">
              Locations
            </p>
            <h3 className="mt-3 text-2xl font-semibold text-stone-950">
              Active location
            </h3>
            <p className="mt-1 text-sm text-stone-500">
              Keep location details, QR slug and operating status up to date.
            </p>
          </div>
          <Button asChild className="rounded-lg">
            <Link href="/restaurant/location/edit">
              <ButtonLabel icon={PencilIcon}>Edit location</ButtonLabel>
            </Link>
          </Button>
        </CardHeader>
        <CardContent className="px-5 pb-5">
          <div className="rounded-lg border border-stone-200 bg-stone-50 p-4">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <MapPinIcon className="size-4 text-stone-500" />
                  <p className="font-semibold text-stone-950">{snapshot.location.name}</p>
                  <span className="rounded-md border border-stone-200 bg-white px-2 py-0.5 text-xs font-semibold uppercase tracking-[0.14em] text-stone-500">
                    {snapshot.location.isActive ? "Active" : "Disabled"}
                  </span>
                </div>
                <p className="mt-2 text-sm text-stone-600">
                  {snapshot.location.label || "No location label"}
                </p>
                <p className="mt-1 text-sm text-stone-500">
                  Timezone: {snapshot.location.timezone}
                </p>
                <p className="mt-1 text-sm text-stone-500">
                  QR slug: {snapshot.location.qrSlug || "Not set"}
                </p>
              </div>
              {snapshot.location.qrSlug ? (
                <Button asChild variant="outline" className="rounded-lg">
                  <Link href={`/order?qr=${encodeURIComponent(snapshot.location.qrSlug)}`}>
                    <ButtonLabel icon={ExternalLinkIcon}>Open customer link</ButtonLabel>
                  </Link>
                </Button>
              ) : null}
            </div>
          </div>
        </CardContent>
      </Card>
    </SaasAdminShell>
  );
}
