"use client";

import { useState } from "react";
import { ReceiptTextIcon, SaveIcon } from "lucide-react";
import { toast } from "sonner";

import { ButtonLabel } from "@/components/shared/ButtonLabel";
import { FormField } from "@/components/shared/FormField";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { requestJson } from "@/lib/api-client";
import {
  receiptPrintFormatLabels,
  receiptPrintFormats,
  type ReceiptPrintFormat,
  type RestaurantReceiptSettings,
} from "@/lib/receipt-settings";

export function RestaurantReceiptSettingsForm({
  apiPath,
  initialSettings,
}: {
  apiPath: string;
  initialSettings: RestaurantReceiptSettings;
}) {
  const [settings, setSettings] = useState(initialSettings);
  const [isSaving, setIsSaving] = useState(false);

  async function save() {
    setIsSaving(true);

    try {
      const payload = await requestJson<{ settings: RestaurantReceiptSettings }>(
        apiPath,
        { body: settings, method: "PATCH" },
      );
      setSettings(payload.settings);
      toast.success("Receipt settings saved.");
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Receipt settings could not be saved.",
      );
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <Card className="themed-card rounded-xl">
      <CardHeader className="px-5 pt-5">
        <div className="flex items-start gap-3">
          <ReceiptTextIcon className="mt-1 size-5 text-amber-700" />
          <div>
            <h3 className="text-2xl font-semibold themed-title">Receipts</h3>
            <p className="mt-1 text-sm themed-muted">
              Choose the default print layout and customer-facing footer.
            </p>
          </div>
        </div>
      </CardHeader>
      <CardContent className="grid gap-4 px-5 pb-5 md:grid-cols-2">
        <FormField label="Print format" tone="themed">
          <Select
            value={settings.printFormat}
            onValueChange={(printFormat) =>
              setSettings((current) => ({
                ...current,
                printFormat: printFormat as ReceiptPrintFormat,
              }))
            }
          >
            <SelectTrigger className="themed-input">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {receiptPrintFormats.map((format) => (
                <SelectItem key={format} value={format}>
                  {receiptPrintFormatLabels[format]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </FormField>
        <FormField label="Footer message" tone="themed">
          <Input
            className="themed-input"
            maxLength={160}
            placeholder="Thank you for your order."
            value={settings.footerMessage ?? ""}
            onChange={(event) =>
              setSettings((current) => ({
                ...current,
                footerMessage: event.target.value,
              }))
            }
          />
        </FormField>
        <Button
          type="button"
          className="w-fit md:col-span-2"
          disabled={isSaving}
          onClick={() => void save()}
        >
          <ButtonLabel icon={SaveIcon}>
            {isSaving ? "Saving..." : "Save receipt settings"}
          </ButtonLabel>
        </Button>
      </CardContent>
    </Card>
  );
}
