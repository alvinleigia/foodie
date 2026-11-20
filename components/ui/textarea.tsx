"use client"

import * as React from "react"

import { cn } from "@/lib/utils"
import { controlStyles } from "@/components/ui/control-styles"

function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(
        controlStyles(),
        "min-h-24 w-full px-3 py-2 text-base md:text-sm",
        className,
      )}
      {...props}
    />
  )
}

export { Textarea }
