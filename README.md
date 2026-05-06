# tanvex

[![License: MIT](https://img.shields.io/badge/License-MIT-000000.svg)](https://opensource.org/licenses/MIT)

![tanvex](public/og.png)

TanStack Start + Convex + Better Auth + Resend, wired end-to-end. Email + password and username sign-in, OTP verification, avatar uploads, rate-limited HTTP API, SSR auth. Vite 8 with Rolldown+Oxc, Tailwind v4, shadcn/ui `base-luma` on Base UI, Oxlint + Oxfmt, Vitest 4, React 19, TypeScript 6. Use any PM: bun, pnpm, npm, or yarn.

Live demo: https://tanvex-demo.vercel.app

## Quick start

Needs Node 20+ or [Bun](https://bun.sh), a [Convex](https://convex.dev) account (free tier), and a [Resend](https://resend.com/api-keys) API key (`re_...`, free tier is 3k/month).

```bash
git clone https://github.com/ramonclaudio/tanvex.git
cd tanvex
bun install         # or pnpm install, npm install, yarn install
bun run setup       # or pnpm setup, npm run setup, yarn setup
bun run dev         # or pnpm dev, npm run dev, yarn dev
```

Open [http://localhost:3000](http://localhost:3000). Sign up with a real email, you'll get an OTP from Resend.

For local Convex via Docker instead of cloud: `bun run setup:local`.

`setup` wipes `node_modules` and build artifacts, reinstalls deps with the detected PM, runs `convex dev` (creates a project, writes `CONVEX_DEPLOYMENT` and `VITE_CONVEX_URL` to `.env.local`, pushes functions, regenerates types), auto-generates `BETTER_AUTH_SECRET`, and prompts for your Resend key, sender, and app name. Re-running won't rotate existing Convex env vars; for one-off changes use `bunx convex env set NAME VALUE`.

## Scripts

```
dev                            Vite + Convex dev servers on :3000
build                          vite build && tsc --noEmit
start                          Nitro SSR server from .output/
preview                        vite preview
analyze                        ANALYZE=1 vite build with rollup visualizer
typecheck                      tsc --noEmit
lint                           oxlint
lint:fix                       oxlint --fix (safe fixes only)
lint:fix:suggest               oxlint --fix --fix-suggestions
lint:fix:dangerous             oxlint --fix --fix-suggestions --fix-dangerously
fmt                            oxfmt
fmt:check                      oxfmt --check
test                           vitest run
test:watch                     vitest
setup                          wipe, reinstall, configure Convex + Resend
setup:local                    same, with Docker Convex
setup:fresh                    provision a new Convex deployment
clean                          full reset: trash artifacts, reinstall, fmt, convex codegen, lint --fix, build, typecheck, test
```

Invoke with your package manager: `npm run <name>`, `pnpm <name>`, `bun run <name>`, or `yarn <name>`. The `clean` and `setup` scripts auto-detect which one and reinstall accordingly.

## Adding shadcn components

```bash
npx shadcn@latest add sheet dialog tabs
# or: pnpm dlx, bunx, yarn dlx
```

Components land in `src/components/ui/`. Import via the `@/` alias:

```tsx
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet"
```

`base-luma` is pinned in `components.json`, so every new component picks it up. The full design system (colors, typography, radii, component recipes) is in `DESIGN.md`; lint with `npx @google/design.md lint DESIGN.md`.

## Resend webhook (optional)

Ships delivery events (`delivered`, `bounced`, `complained`) back to Convex. Auth works without it, you just lose visibility on mail delivery.

1. Run `setup` first so the Convex project exists
2. Go to [resend.com/webhooks](https://resend.com/webhooks), point at `https://<project>.convex.site/resend-webhook`
3. Copy the signing secret
4. `bunx convex env set RESEND_WEBHOOK_SECRET <secret>`

## Customize for your project

Update before you deploy.

**Project metadata** (`src/lib/site.ts`):

```
SITE_URL          # canonical URL, og:url, sitemap entries
SITE_NAME         # used in <title> suffix and OG site name
SITE_TITLE        # default page title
SITE_DESCRIPTION  # meta description, OG description
AUTHOR_NAME, AUTHOR_URL, AUTHOR_TWITTER, AUTHOR_GITHUB, REPO_URL
```

**Package metadata** (`package.json`):

```
name, description, author, homepage, repository, bugs, keywords
```

**SEO files**:

- `public/robots.txt` — `Sitemap:` line
- `public/sitemap.xml` — `<loc>` entries
- `public/.well-known/security.txt` — `Contact:` and `Canonical:`
- `public/llms.txt`, `public/llms-full.txt`

**Cloudflare worker name** (`wrangler.toml`):

```
name = "your-worker"
```

**Find anything missed**:

```bash
grep -r "ramonclaudio/tanvex\|tanvex-demo\.vercel\.app" -l --exclude-dir=node_modules
```

## Site URL on production

`src/lib/site.ts` reads `import.meta.env.VITE_SITE_URL` with a `http://localhost:3000` fallback. Two ways to set it for production:

1. **Edit `src/lib/site.ts`** — change the fallback to your domain. Simplest, no env var needed.
2. **Set `VITE_SITE_URL` in your platform's env vars** — keeps the source untouched, lets each environment override independently.

If you skip both, SEO meta will point at `localhost`. Search engines and social cards will be wrong.

## Continuous integration

`.github/workflows/ci.yml` runs on every push to `main` and every PR. For each of `bun`, `pnpm`, `npm`, `yarn`: install, typecheck, lint, fmt:check, test, build. Any failure on any PM blocks merge. Deploy success is verified by each platform's native check (Vercel commit status, Cloudflare Workers Builds).

## Deploying

Two parts: a Convex backend and a frontend host. Nitro auto-detects the host from build env (`VERCEL`, `NETLIFY`, Cloudflare Workers) and emits the right output. Security headers, build commands, and bun version are pinned in the shipped `vercel.json`, `netlify.toml`, and `wrangler.toml` — no edits needed. `VITE_*` env vars are build-time, set them in the platform's env vars before deploys.

### Convex backend

```bash
bunx convex deploy --cmd "bun run build"     # provisions prod

bunx convex env set SITE_URL          https://your-app.example.com --prod
bunx convex env set BETTER_AUTH_SECRET $(openssl rand -base64 32)   --prod
bunx convex env set RESEND_API_KEY    re_your_key                   --prod
bunx convex env set EMAIL_FROM        "Your App <noreply@yourdomain.com>" --prod
bunx convex env set APP_NAME          "Your App"                    --prod
bunx convex env set RESEND_TEST_MODE  false                         --prod
```

`bun run setup` wired the dev deployment locally. `SITE_URL` is the canonical frontend host.

### Frontend host env vars

Set these on every host (production environment):

```
CONVEX_DEPLOYMENT       prod:your-project
VITE_CONVEX_URL         https://your-project.convex.cloud
VITE_CONVEX_SITE_URL    https://your-project.convex.site
SITE_URL                https://your-app.example.com
VITE_SITE_URL           same as SITE_URL
```

### Vercel

Ships `vercel.json` (pins bun via `installCommand`, runs `bun run build`). Deploy via [vercel.com/new](https://vercel.com/new) (import repo, add the env vars above under Project Settings → Environment Variables) or:

```bash
npx vercel link
npx vercel --prod
npx vercel env add VITE_SITE_URL production   # repeat per variable
```

### Netlify

Ships `netlify.toml` (build command, publish dir, `BUN_VERSION=1.3.13` pin). Deploy via [app.netlify.com/start](https://app.netlify.com/start) (connect repo, add the env vars above under Site Settings → Environment Variables) or:

```bash
npx netlify init
npx netlify deploy --prod
npx netlify env:set VITE_SITE_URL https://your-app.example.com --context production
```

### Cloudflare Workers

Ships `wrangler.toml` (`compatibility_date`, `nodejs_compat`, build command). Workers + Static Assets, not Pages (Pages reserves the `ASSETS` binding Nitro needs). **Env vars must be set as build-time vars** (Vite bakes `import.meta.env.VITE_*` at build), not runtime bindings. Deploy via [dash.cloudflare.com](https://dash.cloudflare.com) → Workers & Pages → Create → Workers (connect repo, add the env vars above under Settings → Builds → Variables and secrets) or:

```bash
bunx wrangler login
VITE_SITE_URL=https://your-app.example.com bun run build
bunx wrangler deploy
```

### Other platforms

Anywhere Nitro runs (Node, Bun, AWS Lambda, Deno Deploy, etc.): set `NITRO_PRESET` (e.g. `node-server`) and run `bun run build`. Output lands in `.output/`.

## Project structure

```
.
├── convex/                            # backend
│   ├── auth.ts                        # Better Auth config, user helpers
│   ├── auth.config.ts                 # JWT for Convex-side auth checks
│   ├── crons.ts                       # scheduled jobs
│   ├── email.ts                       # Resend helpers + OTP templates
│   ├── http.ts                        # HTTP router with CORS
│   ├── origins.ts                     # SITE_URL + TRUSTED_ORIGINS parsing
│   ├── rateLimit.ts                   # token-bucket limiter config
│   ├── schema.ts                      # users table (identity merged from Better Auth)
│   ├── users.ts                       # profile queries and mutations
│   └── validators.ts                  # shared Convex validators
├── patches/                           # *.patch files applied to node_modules via postinstall
├── scripts/
│   ├── _run.mjs                       # runtime-agnostic launcher (bun -> tsx -> npx tsx)
│   ├── apply-patches.mjs              # postinstall: applies patches/*.patch via git apply
│   ├── clean.ts                       # `<pm> run clean`: full reset, fix + verify chain
│   └── setup.ts                       # one-command onboarding
└── src/
    ├── components/
    │   ├── default-catch-boundary.tsx # router error boundary
    │   ├── devtools.tsx               # TanStack devtools (dev only)
    │   ├── not-found.tsx              # 404 page
    │   ├── theme-provider.tsx         # light/dark/system with no-flash script
    │   ├── theme-toggle.tsx           # dropdown toggle
    │   ├── user-menu.tsx              # avatar dropdown
    │   ├── web-vitals.tsx             # CLS/INP/LCP reporter
    │   └── ui/                        # shadcn/ui base-luma primitives
    ├── lib/
    │   ├── auth-client.ts             # Better Auth client
    │   ├── auth-server.ts             # server-side auth helpers
    │   ├── seo.ts                     # head meta helper
    │   ├── site.ts                    # SITE_URL, SITE_NAME, SITE_TITLE, AUTHOR_*
    │   └── utils.ts                   # cn() class merger
    ├── routes/
    │   ├── __root.tsx                 # shellComponent: html/body shell, header bar, theme, Toaster
    │   ├── _authed.tsx                # auth gate
    │   ├── _authed/profile.tsx        # profile editor + avatar upload + change password
    │   ├── api/auth/                  # Better Auth proxy for TanStack Start
    │   ├── index.tsx                  # homepage
    │   └── sign-in.tsx                # auth UI: signin, signup, OTP verify, reset
    ├── router.tsx
    ├── routeTree.gen.ts               # auto-generated by TanStack Router
    ├── styles.css                     # Tailwind v4 + base-luma + reduced-motion
    └── vite-env.d.ts                  # typed import.meta.env
```

## License

MIT.
