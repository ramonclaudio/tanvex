# tanvex

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

I kept scaffolding the same auth, email, and profile setup across projects. SSR wiring, OTP verification, avatar uploads, rate limits. Decided to extract it into something I can clone and have running in one command. TanStack Start + Convex + Better Auth + shadcn/ui. Putting it here in case anyone else finds it useful.

Email/password auth with username support and OTP verification through Resend. User profiles with avatar uploads to Convex storage. Token bucket rate limiting on every endpoint. Full SSR with auth that works during server render. A setup script that connects Convex, writes every env var, and drops you into dev mode ready to go.

Bun + TanStack Start + Convex + React 19 + Tailwind v4 + Zod v4.

## Install

Needs [Bun](https://bun.sh), a [Convex](https://convex.dev) account (free tier works), and a [Resend](https://resend.com/api-keys) API key (`re_...`, free tier is 3k/month).

```bash
git clone https://github.com/ramonclaudio/tanvex.git
cd tanvex
bun run setup
bun run dev
```

Open [http://localhost:3000](http://localhost:3000). Sign up with a real email, you'll get an OTP from Resend.

For local Convex via Docker instead of cloud:

```bash
bun run setup --local
```

## What `bun run setup` Does

Wipes `node_modules`, lockfile, build artifacts, caches, and generated files. Runs `bun install`. Runs `bunx convex dev --once` which opens browser login on first run, creates a project, writes `CONVEX_DEPLOYMENT` and `VITE_CONVEX_URL` to `.env.local`, pushes functions and regenerates types. Auto-generates `BETTER_AUTH_SECRET`. Prompts for your Resend key, sender address, and app name.

Re-running setup does not rotate existing Convex env vars. For one-off changes use `bunx convex env set NAME VALUE`.

Flags: `--local` (Docker), `--fresh` (new deployment), `--version`, `--help`.

## Auth

Sign in with email + password or username + password. Sign up takes name, email, password (required) plus username and avatar (optional). Username is 3-30 chars, alphanumeric + `_` and `.`, checked against reserved names with a debounced availability check. Avatars are `image/*`, max 5MB, stored in Convex. Email verification is OTP through the Better Auth `emailOTP` plugin delivered via Resend.

Sessions expire in 7 days, refresh after 1 day.

Rate limits on the HTTP layer:

| Endpoint | Limit |
| --- | ---: |
| `/sign-in/*` | 5/min |
| `/sign-up/*` | 3/min |
| `/email-otp/request-password-reset` | 3/hour |
| `/email-otp/reset-password` | 3/min |
| `/email-otp/send-verification-otp` | 3/min |
| `/list-sessions` | 30/min |
| `/get-session` | 60/min |

SSR auth works because the root route fetches the auth token via `createServerFn`, sets it on `convexQueryClient` before render, and hands it off to the client on hydrate.

## Routes

| Path | Auth |
| --- | :---: |
| `/` | no |
| `/auth` | no (redirects if signed in) |
| `/profile` | yes (redirects to `/auth`) |
| `/api/auth/*` | Better Auth |

## HTTP API

| Method | Path | Auth | Limit |
| --- | --- | :---: | :---: |
| `GET` | `/api/health` | no | no |
| `GET` | `/api/users?id=<userId>` | no | `apiRead` |
| `GET` | `/api/users/list?cursor=...&limit=...` | no | `apiRead` |

## Scripts

| Script | What it does |
| --- | --- |
| `bun run setup` | wipe, reinstall, configure Convex + Resend |
| `bun run setup --local` | same, with Docker Convex |
| `bun run dev` | Vite + Convex dev servers on :3000 |
| `bun run build` | production build |
| `bun run serve` | preview build |
| `bun run check` | Prettier + ESLint |
| `bun run cleanup` | nuke deps and artifacts, reinstall |

## Resend Webhook (Optional)

Ships delivery events (`delivered`, `bounced`, `complained`) back to Convex. Auth works without it, you just lose visibility on mail delivery.

1. Run `bun run setup` first so the Convex project exists
2. Go to [resend.com/webhooks](https://resend.com/webhooks), point at `https://<project>.convex.site/resend-webhook`
3. Copy the signing secret
4. `bunx convex env set RESEND_WEBHOOK_SECRET <secret>`

## Deploy

```bash
bunx convex deploy --cmd "bun run build"
```

Set prod env vars on Convex:

```bash
bunx convex env set SITE_URL https://your-app.vercel.app --prod
bunx convex env set BETTER_AUTH_SECRET $(openssl rand -base64 32) --prod
bunx convex env set RESEND_API_KEY re_your_production_key --prod
bunx convex env set EMAIL_FROM "Your App <noreply@yourdomain.com>" --prod
bunx convex env set APP_NAME "Your App" --prod
bunx convex env set RESEND_TEST_MODE false --prod
```

Then set `CONVEX_DEPLOYMENT=prod:your-project-name` and `SITE_URL` on your host.

## License

MIT
