"use client"

import * as React from "react"

import { cn } from "@/lib/utils"

function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(
        "min-h-24 w-full rounded-xl border border-stone-200 bg-white px-4 py-3 text-base text-stone-900 outline-none transition focus:border-amber-500 disabled:cursor-not-allowed disabled:bg-stone-100 disabled:text-stone-500",
        className,
      )}
      {...props}
    />
  )
}

export { Textarea }
