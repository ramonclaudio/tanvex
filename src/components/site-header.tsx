import { Link, useRouterState } from '@tanstack/react-router'
import { Home, LogOut, Menu, User } from 'lucide-react'
import { Authenticated, Unauthenticated } from 'convex/react'
import { useQuery } from 'convex-helpers/react'

import { api } from '@convex/_generated/api'
import { cn } from '@/lib/utils'
import { useIsMobile } from '@/hooks/use-mobile'
import { useSidebar } from '@/components/ui/sidebar'
import { Button } from '@/components/ui/button'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  NavigationMenu,
  NavigationMenuItem,
  NavigationMenuList,
  navigationMenuTriggerStyle,
} from '@/components/ui/navigation-menu'
import { authClient } from '@/lib/auth-client'
import { ModeToggle } from '@/components/mode-toggle'

const navItems = [
  {
    title: 'Home',
    url: '/',
    icon: Home,
  },
]

export function SiteHeader() {
  const isMobile = useIsMobile()
  const router = useRouterState()
  const currentPath = router.location.pathname
  const { toggleSidebar } = useSidebar()

  return (
    <header className="sticky top-0 z-50 w-full border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="flex h-14 items-center px-4">
        {/* Logo */}
        <Link to="/" className="mr-6 flex items-center space-x-2">
          <div className="flex size-6 items-center justify-center rounded bg-primary text-primary-foreground">
            <Home className="size-3" />
          </div>
          <span className="font-bold">App</span>
        </Link>

        {/* Desktop: Show navigation menu */}
        {!isMobile && (
          <NavigationMenu className="justify-start">
            <NavigationMenuList className="justify-start">
              {navItems.map((item) => (
                <NavigationMenuItem key={item.title}>
                  <Link
                    to={item.url}
                    className={cn(
                      navigationMenuTriggerStyle(),
                      currentPath === item.url && 'bg-accent/50'
                    )}
                  >
                    <item.icon className="mr-2 size-4" />
                    {item.title}
                  </Link>
                </NavigationMenuItem>
              ))}
            </NavigationMenuList>
          </NavigationMenu>
        )}

        {/* Spacer */}
        <div className="flex-1" />

        {/* Right side actions */}
        <div className="flex items-center gap-2">
          {/* Theme toggle */}
          <ModeToggle />

          {/* Avatar dropdown menu */}
          <Authenticated>
            <AuthenticatedMenu />
          </Authenticated>
          <Unauthenticated>
            <UnauthenticatedMenu />
          </Unauthenticated>

          {/* Mobile: Show hamburger menu */}
          {isMobile && (
            <Button
              variant="ghost"
              size="icon"
              onClick={toggleSidebar}
              aria-label="Open menu"
            >
              <Menu className="size-5" />
            </Button>
          )}
        </div>
      </div>
    </header>
  )
}

function AuthenticatedMenu() {
  const { data: user } = useQuery(api.auth.getCurrentUser)

  const handleSignOut = async () => {
    await authClient.signOut({
      fetchOptions: {
        onSuccess: () => {
          // Reload the page to clear auth state and allow expectAuth to work correctly
          location.reload()
        },
      },
    })
  }

  const getInitials = (name?: string, email?: string) => {
    if (name) {
      return name
        .split(' ')
        .map((n) => n[0])
        .join('')
        .toUpperCase()
        .slice(0, 2)
    }
    if (email) {
      return email[0].toUpperCase()
    }
    return 'U'
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" className="relative size-8 rounded-full">
          <Avatar className="size-8">
            <AvatarImage src={user?.avatarUrl || undefined} alt={user?.fullName ?? 'User'} />
            <AvatarFallback>{getInitials(user?.fullName, user?.email)}</AvatarFallback>
          </Avatar>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-56" align="end" forceMount>
        <DropdownMenuLabel className="font-normal">
          <div className="flex flex-col space-y-1">
            <p className="text-sm font-medium leading-none">{user?.fullName ?? 'User'}</p>
            <p className="text-xs leading-none text-muted-foreground">
              {user?.email}
            </p>
          </div>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link to="/profile">
            <User className="mr-2 size-4" />
            Profile
          </Link>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={handleSignOut}>
          <LogOut className="mr-2 size-4" />
          Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

function UnauthenticatedMenu() {
  return (
    <Button asChild variant="default" size="sm">
      <Link to="/auth">Sign in</Link>
    </Button>
  )
}
