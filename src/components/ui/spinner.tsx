import Loading03Icon from "@hugeicons/core-free-icons/Loading03Icon"
import { HugeiconsIcon } from "@hugeicons/react"

import { cn } from "@/lib/utils"

// strokeWidth is set here as a number; svg's string | number type conflicts.
function Spinner({ className, ...props }: Omit<React.ComponentProps<"svg">, "strokeWidth">) {
  return (
    <HugeiconsIcon
      icon={Loading03Icon}
      strokeWidth={2}
      data-slot="spinner"
      role="status"
      aria-label="Loading"
      className={cn("size-4 animate-spin", className)}
      {...props}
    />
  )
}

export { Spinner }
