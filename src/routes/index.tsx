import { api } from "@convex/_generated/api"
import ArrowRight01Icon from "@hugeicons/core-free-icons/ArrowRight01Icon"
import CheckmarkCircle02Icon from "@hugeicons/core-free-icons/CheckmarkCircle02Icon"
import CodeSquareIcon from "@hugeicons/core-free-icons/CodeSquareIcon"
import CommandIcon from "@hugeicons/core-free-icons/CommandIcon"
import Copy01Icon from "@hugeicons/core-free-icons/Copy01Icon"
import DatabaseIcon from "@hugeicons/core-free-icons/DatabaseIcon"
import FlashIcon from "@hugeicons/core-free-icons/FlashIcon"
import GithubIcon from "@hugeicons/core-free-icons/GithubIcon"
import LockPasswordIcon from "@hugeicons/core-free-icons/LockPasswordIcon"
import MagicWand01Icon from "@hugeicons/core-free-icons/MagicWand01Icon"
import PaintBoardIcon from "@hugeicons/core-free-icons/PaintBoardIcon"
import RocketIcon from "@hugeicons/core-free-icons/RocketIcon"
import SparklesIcon from "@hugeicons/core-free-icons/SparklesIcon"
import StarIcon from "@hugeicons/core-free-icons/StarIcon"
import UserCircleIcon from "@hugeicons/core-free-icons/UserCircleIcon"
import { HugeiconsIcon } from "@hugeicons/react"
import { createFileRoute, Link } from "@tanstack/react-router"
import { useQuery } from "convex-helpers/react"
import { Authenticated, Unauthenticated } from "convex/react"
import { useState } from "react"
import { toast } from "sonner"

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button, buttonVariants } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from "@/components/ui/input-group"
import { Kbd } from "@/components/ui/kbd"
import { Separator } from "@/components/ui/separator"

export const Route = createFileRoute("/")({ component: Home })

const INSTALL_CMD = "bunx degit ramonclaudio/tanvex my-app"
const REPO_URL = "https://github.com/ramonclaudio/tanvex"

const stack = [
  {
    icon: RocketIcon,
    name: "TanStack Start",
    detail: "SSR + file-based routing on Nitro 3.",
  },
  {
    icon: DatabaseIcon,
    name: "Convex",
    detail: "Realtime backend. Rate limiter, Resend, and auth components wired.",
  },
  {
    icon: LockPasswordIcon,
    name: "Better Auth",
    detail: "Email + password, username sign-in, OTP via Resend. SSR-safe.",
  },
  {
    icon: FlashIcon,
    name: "Vite 8 + Oxc",
    detail: "Rolldown bundler. Oxc toolchain with Oxlint + Oxfmt.",
  },
  {
    icon: PaintBoardIcon,
    name: "Tailwind v4 + Base UI",
    detail: "shadcn/ui base-luma on @base-ui/react primitives.",
  },
  {
    icon: CodeSquareIcon,
    name: "TypeScript 6 + Vitest 4",
    detail: "strict, verbatimModuleSyntax. jsdom + @testing-library/react.",
  },
]

const highlights = [
  "One-command setup: Convex + Better Auth + Resend in one go",
  "Email OTP verification delivered via Resend",
  "Avatar uploads to Convex storage (`image/*`, max 5MB)",
  "Rate limits on every auth and API endpoint",
  "SSR auth that works during server render",
  "Speculation Rules API prerenders internal links on 200ms hover",
]

function Home() {
  const [copied, setCopied] = useState(false)

  const copyInstall = async () => {
    await navigator.clipboard.writeText(INSTALL_CMD)
    setCopied(true)
    toast.success("Copied to clipboard", { description: INSTALL_CMD })
    setTimeout(() => setCopied(false), 2000)
  }

  const notify = () => {
    toast("Sonner is wired up.", {
      description: "base-luma tokens, HugeIcons, theme-aware.",
      action: { label: "Nice", onClick: () => {} },
    })
  }

  return (
    <main id="main" className="mx-auto max-w-5xl px-6 py-20 sm:py-28">
      <section className="flex flex-col items-start gap-6">
        <div className="flex items-center gap-3">
          <div
            aria-hidden
            className="grid size-11 place-items-center rounded-2xl bg-foreground text-[0.95rem] font-semibold tracking-[-0.06em] text-background shadow-md ring-1 ring-foreground/10"
          >
            tv
          </div>
          <div className="inline-flex items-center gap-2 rounded-full border border-border bg-card px-3 py-1 text-xs text-muted-foreground">
            <HugeiconsIcon icon={SparklesIcon} className="size-3.5" />
            <span>TanStack · Convex · Better Auth</span>
          </div>
        </div>
        <h1 className="text-4xl font-medium tracking-tight sm:text-6xl">tanvex</h1>
        <p className="max-w-2xl text-base leading-relaxed text-pretty text-muted-foreground sm:text-lg">
          TanStack Start + Convex + Better Auth. Email OTP, avatar uploads, rate limits, SSR auth.
          On Vite 8 Rolldown+Oxc, Tailwind v4 + shadcn/ui base-luma on Base UI, Oxlint + Oxfmt.
        </p>

        <Authenticated>
          <WelcomeBack />
        </Authenticated>

        <div className="flex flex-wrap items-center gap-3">
          <Unauthenticated>
            <Link to="/sign-in" className={buttonVariants({ size: "lg" })}>
              Sign in
              <HugeiconsIcon icon={ArrowRight01Icon} data-icon="inline-end" />
            </Link>
          </Unauthenticated>
          <Authenticated>
            <Link to="/profile" className={buttonVariants({ size: "lg" })}>
              <HugeiconsIcon icon={UserCircleIcon} data-icon="inline-start" />
              Your profile
            </Link>
          </Authenticated>
          <a
            href={REPO_URL}
            target="_blank"
            rel="noreferrer"
            className={buttonVariants({ size: "lg", variant: "outline" })}
          >
            <HugeiconsIcon icon={GithubIcon} data-icon="inline-start" />
            Source
          </a>
        </div>

        <InputGroup className="max-w-xl">
          <InputGroupAddon>
            <HugeiconsIcon icon={CommandIcon} />
          </InputGroupAddon>
          <InputGroupInput
            value={INSTALL_CMD}
            readOnly
            aria-label="Install command"
            className="font-mono text-xs"
          />
          <InputGroupAddon align="inline-end">
            <Kbd>⌘</Kbd>
            <Kbd>C</Kbd>
            <InputGroupButton
              variant="ghost"
              size="icon-xs"
              onClick={copyInstall}
              aria-label="Copy command"
            >
              <HugeiconsIcon icon={copied ? CheckmarkCircle02Icon : Copy01Icon} />
            </InputGroupButton>
          </InputGroupAddon>
        </InputGroup>
        <p className="text-xs text-muted-foreground">
          Then{" "}
          <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-[0.7rem]">
            bun run setup
          </code>{" "}
          to wire Convex, Better Auth, and Resend.
        </p>
      </section>

      <Separator className="my-16" />

      <section className="flex flex-col gap-6">
        <div>
          <h2 className="text-2xl font-medium tracking-tight">What's in the box</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Frontend and backend, latest majors, nothing to strip out.
          </p>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {stack.map((item) => (
            <Card key={item.name} size="sm">
              <CardContent className="flex flex-col gap-2">
                <div className="flex size-9 items-center justify-center rounded-2xl bg-muted">
                  <HugeiconsIcon icon={item.icon} className="size-5" />
                </div>
                <div className="mt-2 font-medium">{item.name}</div>
                <div className="text-sm text-muted-foreground">{item.detail}</div>
              </CardContent>
            </Card>
          ))}
        </div>

        <ul className="mt-2 grid gap-2 text-sm text-muted-foreground sm:grid-cols-2">
          {highlights.map((line) => (
            <li key={line} className="flex items-start gap-2">
              <HugeiconsIcon
                icon={CheckmarkCircle02Icon}
                className="mt-0.5 size-4 text-foreground"
              />
              <span>{renderInline(line)}</span>
            </li>
          ))}
        </ul>
      </section>

      <Separator className="my-16" />

      <section className="flex flex-col gap-6">
        <div>
          <h2 className="text-2xl font-medium tracking-tight">Try it</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            shadcn primitives land in{" "}
            <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs">
              src/components/ui/
            </code>
            . Add more with{" "}
            <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs">
              bunx shadcn@latest add
            </code>
            .
          </p>
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          <Alert>
            <HugeiconsIcon icon={MagicWand01Icon} />
            <AlertTitle>base-luma theme</AlertTitle>
            <AlertDescription>
              Rounded-4xl, soft rings, OKLch palette. Light and dark out of the box.
            </AlertDescription>
          </Alert>

          <Alert>
            <HugeiconsIcon icon={StarIcon} />
            <AlertTitle>Trigger a toast</AlertTitle>
            <AlertDescription className="flex items-center gap-3">
              <span>Sonner is mounted in the root route.</span>
              <Button size="xs" variant="outline" onClick={notify}>
                Try it
              </Button>
            </AlertDescription>
          </Alert>
        </div>
      </section>

      <footer className="mt-20 flex flex-wrap items-center justify-between gap-3 text-sm text-muted-foreground">
        <span>
          MIT. Built by{" "}
          <a
            href="https://github.com/ramonclaudio"
            target="_blank"
            rel="noreferrer"
            className="text-foreground underline-offset-4 hover:underline"
          >
            @ramonclaudio
          </a>
          .
        </span>
        <a
          href={REPO_URL}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1.5 text-foreground underline-offset-4 hover:underline"
        >
          <HugeiconsIcon icon={GithubIcon} className="size-4" />
          ramonclaudio/tanvex
        </a>
      </footer>
    </main>
  )
}

function WelcomeBack() {
  const { data: user } = useQuery(api.users.getMe)
  if (!user?.name) return null
  const firstName = user.name.split(" ")[0]
  return (
    <p className="text-sm text-muted-foreground">
      Welcome back, <span className="font-medium text-foreground">{firstName}</span>.
    </p>
  )
}

// Split a string on backtick-delimited segments and render them as styled <code>.
function renderInline(line: string) {
  return line.split(/(`[^`]+`)/).map((part, i) =>
    part.startsWith("`") && part.endsWith("`") ? (
      <code key={i} className="rounded bg-muted px-1.5 py-0.5 font-mono text-[0.75rem]">
        {part.slice(1, -1)}
      </code>
    ) : (
      <span key={i}>{part}</span>
    ),
  )
}
