import FileNotFoundIcon from "@hugeicons/core-free-icons/FileNotFoundIcon"
import { HugeiconsIcon } from "@hugeicons/react"
import { Link } from "@tanstack/react-router"

import { Button } from "@/components/ui/button"
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty"

export function NotFound() {
  return (
    <div className="mx-auto flex min-h-svh w-full max-w-2xl items-center p-6">
      <Empty>
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <HugeiconsIcon icon={FileNotFoundIcon} />
          </EmptyMedia>
          <EmptyTitle>404 - Not Found</EmptyTitle>
          <EmptyDescription>The page you&apos;re looking for doesn&apos;t exist.</EmptyDescription>
        </EmptyHeader>
        <EmptyContent>
          <Button render={<Link to="/" />} nativeButton={false}>
            Go to homepage
          </Button>
          <Button variant="link" onClick={() => window.history.back()}>
            Go back
          </Button>
        </EmptyContent>
      </Empty>
    </div>
  )
}
