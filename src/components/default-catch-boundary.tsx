import Alert02Icon from "@hugeicons/core-free-icons/Alert02Icon"
import { HugeiconsIcon } from "@hugeicons/react"
import { Link, rootRouteId, useMatch, useRouter } from "@tanstack/react-router"
import type { ErrorComponentProps } from "@tanstack/react-router"
import { useEffect } from "react"

import { Button } from "@/components/ui/button"
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty"

export function DefaultCatchBoundary({ error }: ErrorComponentProps) {
  const router = useRouter()
  const isRoot = useMatch({
    strict: false,
    select: (state) => state.id === rootRouteId,
  })

  useEffect(() => {
    if (import.meta.env.DEV) console.error("DefaultCatchBoundary:", error)
  }, [error])

  const message = error instanceof Error ? error.message : "An unexpected error occurred."

  return (
    <div className="mx-auto flex min-h-svh w-full max-w-2xl items-center p-6">
      <Empty>
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <HugeiconsIcon icon={Alert02Icon} />
          </EmptyMedia>
          <EmptyTitle>Something went wrong</EmptyTitle>
          <EmptyDescription>{message}</EmptyDescription>
        </EmptyHeader>
        <EmptyContent>
          <Button onClick={() => router.invalidate()}>Try again</Button>
          {isRoot ? (
            <Button variant="link" render={<Link to="/" />} nativeButton={false}>
              Go to homepage
            </Button>
          ) : (
            <Button variant="link" onClick={() => window.history.back()}>
              Go back
            </Button>
          )}
        </EmptyContent>
      </Empty>
    </div>
  )
}
