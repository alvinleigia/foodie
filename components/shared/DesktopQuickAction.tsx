import type { ComponentType } from "react";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

type QuickActionIcon = ComponentType<{ className?: string }>;

type DesktopQuickActionProps = {
  disabled?: boolean;
  href?: string;
  icon: QuickActionIcon;
  label: string;
  onClick?: () => void;
};

const quickActionClassName =
  "hidden rounded-lg border-border bg-background text-foreground hover:bg-muted md:inline-flex";

export function DesktopQuickAction({
  disabled,
  href,
  icon: Icon,
  label,
  onClick,
}: DesktopQuickActionProps) {
  const trigger = href ? (
    <Button
      asChild
      variant="outline"
      size="icon"
      className={quickActionClassName}
    >
      <Link href={href} aria-label={label}>
        <Icon className="size-4" />
      </Link>
    </Button>
  ) : (
    <Button
      type="button"
      variant="outline"
      size="icon"
      disabled={disabled}
      className={quickActionClassName}
      aria-label={label}
      onClick={onClick}
    >
      <Icon className="size-4" />
    </Button>
  );

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>{trigger}</TooltipTrigger>
        <TooltipContent>{label}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
