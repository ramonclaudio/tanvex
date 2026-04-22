import { api } from "@convex/_generated/api"
import LogoutSquare01Icon from "@hugeicons/core-free-icons/LogoutSquare01Icon"
import UserIcon from "@hugeicons/core-free-icons/UserIcon"
import { HugeiconsIcon } from "@hugeicons/react"
import { Link, useNavigate } from "@tanstack/react-router"
import { useQuery } from "convex-helpers/react"
import { Authenticated, AuthLoading, Unauthenticated } from "convex/react"

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { buttonVariants } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { authClient } from "@/lib/auth-client"
import { cn } from "@/lib/utils"

export function UserMenu() {
  return (
    <>
      <AuthLoading>
        <div className="size-9 animate-pulse rounded-full bg-muted" aria-hidden />
      </AuthLoading>
      <Unauthenticated>
        <SignInLink />
      </Unauthenticated>
      <Authenticated>
        <AuthedMenu />
      </Authenticated>
    </>
  )
}

function SignInLink() {
  return (
    <Link
      to="/sign-in"
      className={cn(
        buttonVariants({ variant: "ghost", size: "sm" }),
        "inline-flex items-center gap-2",
      )}
    >
      Sign in
    </Link>
  )
}

function AuthedMenu() {
  const navigate = useNavigate()
  const { data: user } = useQuery(api.auth.getCurrentUser)

  const handleSignOut = async () => {
    await authClient.signOut()
    await navigate({ to: "/" })
  }

  const label = user?.name || user?.email || "Account"
  const handle = user?.displayUsername ?? user?.username ?? null

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className={cn(
          buttonVariants({ variant: "ghost", size: "icon" }),
          "rounded-full p-0 [&_svg]:size-4",
        )}
        aria-label="Open account menu"
      >
        <Avatar className="size-8">
          <AvatarImage src={user?.avatarUrl ?? undefined} alt={label} />
          <AvatarFallback>
            <HugeiconsIcon icon={UserIcon} strokeWidth={2} />
          </AvatarFallback>
        </Avatar>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" sideOffset={8} className="min-w-52">
        <div className="flex flex-col gap-0.5 px-3 py-2.5">
          <span className="truncate text-sm font-medium text-foreground">{label}</span>
          {handle ? (
            <span className="truncate text-xs text-muted-foreground">@{handle}</span>
          ) : user?.email ? (
            <span className="truncate text-xs text-muted-foreground">{user.email}</span>
          ) : null}
        </div>
        <DropdownMenuSeparator />
        <DropdownMenuItem render={<Link to="/profile" />}>
          <HugeiconsIcon icon={UserIcon} strokeWidth={2} />
          Profile
        </DropdownMenuItem>
        <DropdownMenuItem onClick={handleSignOut}>
          <HugeiconsIcon icon={LogoutSquare01Icon} strokeWidth={2} />
          Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
