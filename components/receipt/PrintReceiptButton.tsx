"use client";

import { useEffect } from "react";
import { PrinterIcon } from "lucide-react";

import { ButtonLabel } from "@/components/shared/ButtonLabel";
import { Button } from "@/components/ui/button";

export function PrintReceiptButton({ autoPrint = false }: { autoPrint?: boolean }) {
  useEffect(() => {
    if (!autoPrint) return;

    const timeoutId = window.setTimeout(() => window.print(), 250);
    return () => window.clearTimeout(timeoutId);
  }, [autoPrint]);

  return (
    <Button type="button" onClick={() => window.print()}>
      <ButtonLabel icon={PrinterIcon}>Print receipt</ButtonLabel>
    </Button>
  );
}
