"use client"

import * as React from "react"

import { cn } from "@/lib/utils"

function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(
        "min-h-24 w-full rounded-xl border border-input bg-background px-4 py-3 text-base text-foreground outline-none transition placeholder:text-muted-foreground focus:border-amber-500 focus:ring-3 focus:ring-amber-500/20 disabled:cursor-not-allowed disabled:bg-muted disabled:text-muted-foreground",
        className,
      )}
      {...props}
    />
  )
}

export { Textarea }
