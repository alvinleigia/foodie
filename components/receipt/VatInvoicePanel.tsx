"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { FileTextIcon } from "lucide-react";
import { toast } from "sonner";

import { ButtonLabel } from "@/components/shared/ButtonLabel";
import { FormField } from "@/components/shared/FormField";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { requestJson } from "@/lib/api-client";
import type { OrderReceipt } from "@/lib/order-receipt-format";

type FullInvoiceDraft = {
  addressLine1: string;
  addressLine2: string;
  city: string;
  countryCode: string;
  name: string;
  postalCode: string;
  region: string;
};

const emptyDraft: FullInvoiceDraft = {
  addressLine1: "",
  addressLine2: "",
  city: "",
  countryCode: "GB",
  name: "",
  postalCode: "",
  region: "",
};

export function VatInvoicePanel({ receipt }: { receipt: OrderReceipt }) {
  const router = useRouter();
  const [draft, setDraft] = useState(emptyDraft);
  const [isFullFormOpen, setIsFullFormOpen] = useState(
    !receipt.canIssueSimplifiedVatInvoice,
  );
  const [isSaving, setIsSaving] = useState(false);

  async function issueInvoice(
    payload:
      | { type: "SIMPLIFIED" }
      | { customer: FullInvoiceDraft; type: "FULL" },
  ) {
    setIsSaving(true);

    try {
      await requestJson(`/api/orders/${receipt.orderId}/vat-invoice`, {
        body: payload,
        method: "POST",
      });
      toast.success("VAT invoice issued.");
      router.refresh();
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "The VAT invoice could not be issued.",
      );
      setIsSaving(false);
    }
  }

  if (!receipt.canIssueVatInvoice || receipt.invoiceNumber) {
    return null;
  }

  return (
    <section className="mb-4 rounded-lg border border-stone-200 bg-white p-5 print:hidden">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-semibold text-stone-950">VAT invoice</h2>
          <p className="mt-1 text-sm text-stone-500">
            Issue one VAT invoice for this paid order. Issued details cannot be edited.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {receipt.canIssueSimplifiedVatInvoice ? (
            <Button
              type="button"
              variant="outline"
              disabled={isSaving}
              onClick={() => void issueInvoice({ type: "SIMPLIFIED" })}
            >
              <ButtonLabel icon={FileTextIcon}>Simplified invoice</ButtonLabel>
            </Button>
          ) : null}
          <Button
            type="button"
            variant={isFullFormOpen ? "secondary" : "outline"}
            onClick={() => setIsFullFormOpen((current) => !current)}
          >
            <ButtonLabel icon={FileTextIcon}>Full invoice</ButtonLabel>
          </Button>
        </div>
      </div>

      {isFullFormOpen ? (
        <form
          className="mt-5 grid gap-4"
          onSubmit={(event) => {
            event.preventDefault();
            void issueInvoice({ customer: draft, type: "FULL" });
          }}
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField label="Customer or business name">
              <Input
                required
                maxLength={160}
                value={draft.name}
                onChange={(event) =>
                  setDraft((current) => ({ ...current, name: event.target.value }))
                }
              />
            </FormField>
            <FormField label="Address line 1">
              <Input
                required
                maxLength={160}
                value={draft.addressLine1}
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    addressLine1: event.target.value,
                  }))
                }
              />
            </FormField>
            <FormField label="Address line 2">
              <Input
                maxLength={160}
                value={draft.addressLine2}
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    addressLine2: event.target.value,
                  }))
                }
              />
            </FormField>
            <FormField label="City">
              <Input
                required
                maxLength={100}
                value={draft.city}
                onChange={(event) =>
                  setDraft((current) => ({ ...current, city: event.target.value }))
                }
              />
            </FormField>
            <FormField label="Region">
              <Input
                maxLength={100}
                value={draft.region}
                onChange={(event) =>
                  setDraft((current) => ({ ...current, region: event.target.value }))
                }
              />
            </FormField>
            <FormField label="Postal code">
              <Input
                required
                maxLength={24}
                value={draft.postalCode}
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    postalCode: event.target.value,
                  }))
                }
              />
            </FormField>
            <FormField label="Country code">
              <Input
                required
                maxLength={2}
                value={draft.countryCode}
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    countryCode: event.target.value.toUpperCase(),
                  }))
                }
              />
            </FormField>
          </div>
          <div>
            <Button type="submit" disabled={isSaving}>
              <ButtonLabel icon={FileTextIcon}>
                {isSaving ? "Issuing..." : "Issue full VAT invoice"}
              </ButtonLabel>
            </Button>
          </div>
        </form>
      ) : null}
    </section>
  );
}
