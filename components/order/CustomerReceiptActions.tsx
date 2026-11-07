"use client";

import Link from "next/link";
import { DownloadIcon, Share2Icon } from "lucide-react";
import { toast } from "sonner";

import { ButtonLabel } from "@/components/shared/ButtonLabel";
import { Button } from "@/components/ui/button";

export function CustomerReceiptActions({ receiptHref }: { receiptHref: string }) {
  const printHref = `${receiptHref}${receiptHref.includes("?") ? "&" : "?"}print=1`;

  async function shareReceipt() {
    const url = new URL(receiptHref, window.location.origin).toString();

    if (navigator.share) {
      try {
        await navigator.share({ title: "Order receipt", url });
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") return;
        toast.error("The receipt could not be shared.");
      }
      return;
    }

    await navigator.clipboard.writeText(url);
    toast.success("Receipt link copied.");
  }

  return (
    <div className="flex flex-wrap justify-center gap-3">
      <Button asChild variant="outline">
        <Link href={printHref} target="_blank">
          <ButtonLabel icon={DownloadIcon}>Download receipt</ButtonLabel>
        </Link>
      </Button>
      <Button type="button" variant="outline" onClick={shareReceipt}>
        <ButtonLabel icon={Share2Icon}>Share</ButtonLabel>
      </Button>
    </div>
  );
}
