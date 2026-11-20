import * as React from "react"

import { cn } from "@/lib/utils"
import { controlStyles, type ControlSize } from "@/components/ui/control-styles"

function Input({
  className,
  controlSize = "default",
  type,
  ...props
}: React.ComponentProps<"input"> & {
  controlSize?: ControlSize;
}) {
  return (
    <input
      type={type}
      data-slot="input"
      data-control-size={controlSize}
      className={cn(
        controlStyles({ controlSize }),
        "w-full py-1 text-base md:text-sm file:inline-flex file:h-6 file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground",
        (controlSize === "lg" || controlSize === "xl") && "md:text-base",
        className
      )}
      {...props}
    />
  )
}

export { Input }
