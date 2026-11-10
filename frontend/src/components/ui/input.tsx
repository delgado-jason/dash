import * as React from "react"

import { cn } from "@/lib/utils"

// The base input styling, exported so other controls (e.g. CityAutocomplete's
// text field) can match the shared Input exactly.
// eslint-disable-next-line react-refresh/only-export-components -- pre-existing, untouched by the colour sweep; owed to this page's phase C restructure
export const inputClass = cn(
  "file:text-foreground placeholder:text-faint selection:bg-primary selection:text-primary-foreground h-11 w-full min-w-0 rounded-[10px] border border-hairline bg-well px-3 text-[16px] text-light transition-[color,box-shadow] outline-none file:inline-flex file:h-7 file:border-0 file:bg-transparent file:text-sm file:font-medium disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50",
  "focus-visible:border-ring focus-visible:ring-ring/40 focus-visible:ring-[3px]",
  "aria-invalid:border-destructive aria-invalid:ring-destructive/30",
)

function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(inputClass, className)}
      {...props}
    />
  )
}

export { Input }
