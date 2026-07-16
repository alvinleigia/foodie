import Link from "next/link";
import { BuildingIcon, FactoryIcon } from "lucide-react";

import { ButtonLabel } from "@/components/shared/ButtonLabel";
import { SectionHeader } from "@/components/shared/SectionHeader";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";

export function OperationsSetupRequired() {
  return (
    <Card className="rounded-xl border-white/60 bg-white/90 shadow-[0_20px_60px_rgba(40,26,20,0.08)]">
      <CardHeader className="px-6 pt-6">
        <SectionHeader
          eyebrow="Operations"
          title="Restaurant access required"
          meta="Orders and menu operations need a configured restaurant before this panel can load."
          className="mb-0"
        />
      </CardHeader>
      <CardContent className="px-6 pb-6">
        <div className="rounded-xl border border-dashed border-stone-300 bg-stone-50/80 p-6">
          <p className="text-sm leading-6 text-stone-600">
            You are signed in at a higher admin level. Create a company, create a
            restaurant, then invite or switch to a restaurant manager or
            order operator account for live operations.
          </p>
          <div className="mt-5 flex flex-wrap gap-3">
            <Button asChild>
              <Link href="/platform">
                <ButtonLabel icon={FactoryIcon}>Go to Platform</ButtonLabel>
              </Link>
            </Button>
            <Button asChild variant="outline">
              <Link href="/company">
                <ButtonLabel icon={BuildingIcon}>Go to Company</ButtonLabel>
              </Link>
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
