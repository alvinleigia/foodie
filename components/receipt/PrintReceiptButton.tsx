"use client";

import { PrinterIcon } from "lucide-react";

import { ButtonLabel } from "@/components/shared/ButtonLabel";
import { Button } from "@/components/ui/button";

export function PrintReceiptButton() {
  return (
    <Button type="button" onClick={() => window.print()}>
      <ButtonLabel icon={PrinterIcon}>Print receipt</ButtonLabel>
    </Button>
  );
}
