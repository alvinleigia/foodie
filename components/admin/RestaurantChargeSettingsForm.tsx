"use client";

import { useState } from "react";
import { HandCoinsIcon, SaveIcon } from "lucide-react";
import { toast } from "sonner";

import { ButtonLabel } from "@/components/shared/ButtonLabel";
import { FormField } from "@/components/shared/FormField";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { requestJson } from "@/lib/api-client";
import type { RestaurantChargeSettings } from "@/lib/restaurant-charge-settings";

function PercentInput({
  label,
  valueBps,
  onChange,
}: {
  label: string;
  valueBps: number;
  onChange: (valueBps: number) => void;
}) {
  return (
    <FormField label={label} tone="themed">
      <Input
        className="themed-input"
        inputMode="decimal"
        min="0.01"
        max="50"
        step="0.01"
        type="number"
        value={valueBps / 100}
        onChange={(event) =>
          onChange(Math.round(Math.max(0, Number(event.target.value)) * 100))
        }
      />
    </FormField>
  );
}

export function RestaurantChargeSettingsForm({
  apiPath,
  initialSettings,
}: {
  apiPath: string;
  initialSettings: RestaurantChargeSettings;
}) {
  const [settings, setSettings] = useState(initialSettings);
  const [isSaving, setIsSaving] = useState(false);

  async function save() {
    setIsSaving(true);

    try {
      const payload = await requestJson<{ settings: RestaurantChargeSettings }>(
        apiPath,
        { body: settings, method: "PATCH" },
      );
      setSettings(payload.settings);
      toast.success("Service charge and tip settings saved.");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Charge settings could not be saved.",
      );
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <Card className="themed-card rounded-xl">
      <CardHeader className="px-5 pt-5">
        <div className="flex items-start gap-3">
          <HandCoinsIcon className="mt-1 size-5 text-amber-700" />
          <div>
            <h3 className="text-2xl font-semibold themed-title">
              Service charge and tips
            </h3>
            <p className="mt-1 text-sm themed-muted">
              Apply a disclosed service charge and offer optional tips at checkout.
            </p>
          </div>
        </div>
      </CardHeader>
      <CardContent className="grid gap-5 px-5 pb-5">
        <section className="grid gap-4 border-b border-border pb-5">
          <label className="flex items-center gap-3 text-sm font-semibold themed-title">
            <Checkbox
              checked={settings.serviceChargeEnabled}
              onCheckedChange={(value) =>
                setSettings((current) => ({
                  ...current,
                  serviceChargeEnabled: value === true,
                }))
              }
            />
            Enable service charge
          </label>
          <div className="grid gap-4 md:grid-cols-4">
            <PercentInput
              label="Service charge (%)"
              valueBps={settings.serviceChargeRateBps}
              onChange={(serviceChargeRateBps) =>
                setSettings((current) => ({ ...current, serviceChargeRateBps }))
              }
            />
            {[
              ["serviceChargeDineIn", "Dine-in"],
              ["serviceChargePickup", "Takeaway"],
              ["serviceChargeDelivery", "Delivery"],
            ].map(([key, label]) => (
              <label
                key={key}
                className="flex min-h-10 items-center gap-3 self-end rounded-lg border border-border px-3 text-sm themed-title"
              >
                <Checkbox
                  checked={Boolean(settings[key as keyof RestaurantChargeSettings])}
                  onCheckedChange={(value) =>
                    setSettings((current) => ({
                      ...current,
                      [key]: value === true,
                    }))
                  }
                />
                {label}
              </label>
            ))}
          </div>
        </section>

        <section className="grid gap-4">
          <label className="flex items-center gap-3 text-sm font-semibold themed-title">
            <Checkbox
              checked={settings.tipsEnabled}
              onCheckedChange={(value) =>
                setSettings((current) => ({ ...current, tipsEnabled: value === true }))
              }
            />
            Offer optional tips
          </label>
          <div className="grid gap-4 sm:grid-cols-3">
            {settings.tipPresetsBps.map((preset, index) => (
              <PercentInput
                key={index}
                label={`Tip preset ${index + 1} (%)`}
                valueBps={preset}
                onChange={(valueBps) =>
                  setSettings((current) => ({
                    ...current,
                    tipPresetsBps: current.tipPresetsBps.map((value, itemIndex) =>
                      itemIndex === index ? valueBps : value,
                    ),
                  }))
                }
              />
            ))}
          </div>
        </section>

        <Button type="button" className="w-fit" disabled={isSaving} onClick={() => void save()}>
          <ButtonLabel icon={SaveIcon}>
            {isSaving ? "Saving..." : "Save charge settings"}
          </ButtonLabel>
        </Button>
      </CardContent>
    </Card>
  );
}
