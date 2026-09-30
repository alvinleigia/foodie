"use client";

import Link from "next/link";
import { useRef } from "react";
import {
  CopyIcon,
  DownloadIcon,
  ExternalLinkIcon,
  QrCodeIcon,
  Settings2Icon,
} from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { toast } from "sonner";

import { ButtonLabel } from "@/components/shared/ButtonLabel";
import { StatusPill } from "@/components/shared/StatusPill";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

type CustomerOrderLinkPanelProps = {
  customerOrderUrl: string | null;
  isActive: boolean;
  manageHref?: string;
  restaurantSlug: string;
};

export function CustomerOrderLinkPanel({
  customerOrderUrl,
  isActive,
  manageHref,
  restaurantSlug,
}: CustomerOrderLinkPanelProps) {
  const qrContainerRef = useRef<HTMLDivElement>(null);

  async function copyLink() {
    if (!customerOrderUrl) {
      return;
    }

    try {
      await navigator.clipboard.writeText(customerOrderUrl);
      toast.success("Customer order link copied.");
    } catch {
      toast.error("Could not copy the customer order link.");
    }
  }

  function downloadQrCode() {
    const qrCode = qrContainerRef.current?.querySelector("svg");

    if (!qrCode) {
      toast.error("Could not generate the QR download.");
      return;
    }

    const source = new XMLSerializer().serializeToString(qrCode);
    const blob = new Blob([source], { type: "image/svg+xml;charset=utf-8" });
    const downloadUrl = URL.createObjectURL(blob);
    const anchor = document.createElement("a");

    anchor.href = downloadUrl;
    anchor.download = `${restaurantSlug}-customer-order-qr.svg`;
    anchor.click();
    URL.revokeObjectURL(downloadUrl);
  }

  return (
    <Card className="rounded-xl border-stone-200 bg-white">
      <CardHeader className="flex flex-row items-start justify-between gap-4 px-5 pt-5">
        <div>
          <div className="flex items-center gap-2">
            <QrCodeIcon className="size-5 text-amber-700" />
            <h3 className="text-xl font-semibold text-stone-950">
              Customer ordering
            </h3>
          </div>
          <p className="mt-1 text-sm text-stone-500">
            Share this link or download its QR code for printed menus and signs.
          </p>
        </div>
        <StatusPill tone={customerOrderUrl ? "success" : "warning"}>
          {customerOrderUrl ? "Ready" : isActive ? "Setup required" : "Inactive"}
        </StatusPill>
      </CardHeader>
      <CardContent className="px-5 pb-5">
        {customerOrderUrl ? (
          <div className="grid items-center gap-5 lg:grid-cols-[minmax(0,1fr)_auto]">
            <div className="min-w-0">
              <label
                htmlFor="customer-order-url"
                className="mb-2 block text-sm font-medium text-stone-700"
              >
                Public menu link
              </label>
              <Input
                id="customer-order-url"
                readOnly
                value={customerOrderUrl}
                className="bg-stone-50"
                onFocus={(event) => event.currentTarget.select()}
              />
              <div className="mt-3 flex flex-wrap gap-2">
                <Button type="button" onClick={() => void copyLink()}>
                  <ButtonLabel icon={CopyIcon}>Copy link</ButtonLabel>
                </Button>
                <Button asChild type="button" variant="outline">
                  <a href={customerOrderUrl} target="_blank" rel="noreferrer">
                    <ButtonLabel icon={ExternalLinkIcon}>Open menu</ButtonLabel>
                  </a>
                </Button>
                <Button type="button" variant="outline" onClick={downloadQrCode}>
                  <ButtonLabel icon={DownloadIcon}>Download QR</ButtonLabel>
                </Button>
                {manageHref ? (
                  <Button asChild type="button" variant="outline">
                    <Link href={manageHref}>
                      <ButtonLabel icon={Settings2Icon}>Manage link</ButtonLabel>
                    </Link>
                  </Button>
                ) : null}
              </div>
            </div>
            <div
              ref={qrContainerRef}
              className="mx-auto grid size-44 shrink-0 place-items-center rounded-lg border border-stone-200 bg-white p-2"
            >
              <QRCodeSVG
                value={customerOrderUrl}
                size={156}
                level="M"
                marginSize={2}
                title="Customer ordering QR code"
              />
            </div>
          </div>
        ) : (
          <div className="flex flex-wrap items-center justify-between gap-4 rounded-lg border border-dashed border-stone-300 bg-stone-50 p-4">
            <p className="text-sm text-stone-600">
              {isActive
                ? "Configure a QR slug or active ordering domain to publish the customer menu."
                : "Activate the ordering point before sharing the customer menu."}
            </p>
            {manageHref ? (
              <Button asChild type="button">
                <Link href={manageHref}>
                  <ButtonLabel icon={Settings2Icon}>
                    Manage customer ordering
                  </ButtonLabel>
                </Link>
              </Button>
            ) : null}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
