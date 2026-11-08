"use client";

import { useState } from "react";
import { DownloadIcon, LoaderCircleIcon } from "lucide-react";
import { toast } from "sonner";

import { ButtonLabel } from "@/components/shared/ButtonLabel";
import { Button } from "@/components/ui/button";

export function DownloadReceiptButton({ receiptHref }: { receiptHref: string }) {
  const [downloading, setDownloading] = useState(false);

  async function downloadReceipt() {
    if (downloading) return;
    setDownloading(true);
    try {
      const url = new URL(receiptHref, window.location.origin);
      url.pathname = `${url.pathname.replace(/\/$/, "")}/pdf`;
      url.searchParams.delete("print");
      const response = await fetch(url, { cache: "no-store" });
      if (!response.ok) {
        const result = await response.json().catch(() => null);
        if (response.status === 401 && result?.loginHref) {
          window.location.assign(result.loginHref);
          return;
        }
        throw new Error(
          result?.error ?? "The receipt could not be downloaded. Please try again.",
        );
      }
      if (!response.headers.get("Content-Type")?.startsWith("application/pdf")) {
        throw new Error(
          "The receipt could not be downloaded. Please try again.",
        );
      }
      const blobUrl = URL.createObjectURL(await response.blob());
      const link = document.createElement("a");
      link.href = blobUrl;
      link.download = response.headers
        .get("Content-Disposition")
        ?.match(/filename="([^"]+)"/)?.[1] ?? "receipt.pdf";
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(blobUrl), 60_000);
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "The receipt could not be downloaded. Please try again.",
      );
    } finally {
      setDownloading(false);
    }
  }

  return (
    <Button
      type="button"
      variant="outline"
      disabled={downloading}
      onClick={downloadReceipt}
      aria-busy={downloading}
    >
      <ButtonLabel icon={downloading ? LoaderCircleIcon : DownloadIcon}>
        {downloading ? "Downloading..." : "Download receipt"}
      </ButtonLabel>
    </Button>
  );
}
