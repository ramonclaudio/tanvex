# tanvex

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![GitHub stars](https://img.shields.io/github/stars/ramonclaudio/tanvex?style=flat)](https://github.com/ramonclaudio/tanvex)
[![Last commit](https://img.shields.io/github/last-commit/ramonclaudio/tanvex)](https://github.com/ramonclaudio/tanvex)

Full-stack TypeScript starter with TanStack Start, Convex, Better Auth, and shadcn/ui. SSR authentication, email OTP via Resend, user profiles with avatar uploads, rate limiting, and one-command setup.

Every time I start a new web project I pretty much reach for the same stack. And every time I end up re-wiring SSR auth, Resend for OTP emails, rate limits, and the profile screen that nobody actually wants to build. So I turned it into a starter I can clone and be running in one command.

Email/password + username auth with OTP verification. User profiles with avatar uploads to Convex storage. Rate limits. Transactional email through Resend. Full SSR. A `bun run setup` that wipes state, connects Convex, writes every env var, and drops you into `bun run dev` ready to sign up.

## Prerequisites

Three things, all free for development.

`bun`. Install it.

```bash
curl -fsSL https://bun.sh/install | bash
```

A [Convex](https://convex.dev) account for the backend (database, functions, file storage, real-time). Free tier is fine. The setup script logs you in on first run. If you'd rather skip the cloud, install [Docker](https://docs.docker.com/get-docker/) and pass `--local`.

A [Resend](https://resend.com) API key for OTP emails. Grab one at [resend.com/api-keys](https://resend.com/api-keys), it starts with `re_`. Free tier is 3,000/month. Without it, auth breaks at runtime.

## Quick Start

```bash
bun run setup    # wipes, reinstalls, walks you through Convex + Resend
bun run dev      # dev server on http://localhost:3000
```

Open [http://localhost:3000](http://localhost:3000), click **Sign up**, (use a real email for security purposes) you'll get an OTP from Resend.

For a local Convex backend via Docker:

```bash
bun run setup --local
bunx convex dev --local    # keep this running in another terminal
```

## What `bun run setup` Does

One command, fresh clone to running app. Same command for full reset.

1. Wipes `node_modules`, `bun.lock`, build outputs (`dist`, `.output`, `.nitro`), caches (`.tanstack`, `.vite`, `.cache`), and generated files (`convex/_generated`, `src/routeTree.gen.ts`).
2. Runs `bun install`.
3. Runs `bunx convex dev --once`: opens browser login on first run, creates or picks a Convex project, writes `CONVEX_DEPLOYMENT` and `VITE_CONVEX_URL` to `.env.local`, pushes `convex/` and regenerates types.
4. Adds `VITE_CONVEX_SITE_URL` to `.env.local`.
5. Sets `SITE_URL` and `BETTER_AUTH_SECRET` (auto-generated 32-byte base64, equivalent to `openssl rand -base64 32`) on the Convex deployment.
6. Prompts for `RESEND_API_KEY`, `EMAIL_FROM` (defaults to `App <onboarding@resend.dev>`), `APP_NAME`, and optional `RESEND_WEBHOOK_SECRET`.

Re-running setup does not rotate existing Convex env vars. For one-off changes use `bunx convex env set NAME VALUE` directly.

Flags: `--local` (Docker Convex), `--fresh` (new deployment), `--version`, `--help`.

## Resend Webhook (Optional)

The webhook ships Resend delivery events (`delivered`, `bounced`, `complained`) back to Convex so you can see when mail fails. Auth works without it, you just have no visibility.

1. Run `bun run setup` first so the Convex project exists. You'll get a URL like `https://<project>.convex.site`.
2. Skip the `RESEND_WEBHOOK_SECRET` prompt (leave blank).
3. Go to [resend.com/webhooks](https://resend.com/webhooks), point a new webhook at `https://<project>.convex.site/resend-webhook`.
4. Copy the signing secret Resend shows you once.
5. Set it: `bunx convex env set RESEND_WEBHOOK_SECRET <secret>`

## Sending to Real Email Addresses

By default `RESEND_TEST_MODE=true`, which restricts Resend to `@resend.dev` addresses. Fine for testing. To send to real inboxes, verify a domain at [resend.com/domains](https://resend.com/domains), then:

```bash
bunx convex env set EMAIL_FROM "Your App <noreply@yourdomain.com>"
bunx convex env set RESEND_TEST_MODE false
```

## Resetting

`bun run setup` wipes and reconfigures from scratch. `bun run cleanup` nukes `node_modules`, lockfile, build artifacts, and reinstalls, leaving env config alone. Single env var change? `bunx convex env set NAME VALUE` or edit `.env.local` directly.

## Environment Variables

`bun run setup` writes all of these for you. Two reference templates ship with the repo: [`.env.local.example`](.env.local.example) (Vite, read from repo root) and [`.env.convex.example`](.env.convex.example) (Convex deployment).

### Local (`.env.local`)

| Variable | Source |
| --- | --- |
| `CONVEX_DEPLOYMENT` | `convex dev --once` |
| `VITE_CONVEX_URL` | `convex dev --once` |
| `VITE_CONVEX_SITE_URL` | setup script |

### Convex deployment

| Variable | Purpose | Required |
| --- | --- | :---: |
| `SITE_URL` | app base URL, CORS, Better Auth redirects | yes |
| `BETTER_AUTH_SECRET` | 32-byte base64 for signing cookies and JWTs | yes |
| `RESEND_API_KEY` | `re_...` from Resend | yes |
| `EMAIL_FROM` | `From:` header for auth mail | yes |
| `APP_NAME` | brand name in email subjects | yes |
| `RESEND_TEST_MODE` | `true` restricts sends to `@resend.dev` | optional |
| `RESEND_WEBHOOK_SECRET` | signing secret for `/resend-webhook` | optional |

### Production

Set in your host (Vercel, Netlify, whatever):

```bash
CONVEX_DEPLOYMENT=prod:your-project-name
SITE_URL=https://your-app.vercel.app
```

Set on the Convex prod deployment:

```bash
bunx convex env set SITE_URL https://your-app.vercel.app --prod
bunx convex env set BETTER_AUTH_SECRET $(openssl rand -base64 32) --prod
bunx convex env set RESEND_API_KEY re_your_production_key --prod
bunx convex env set EMAIL_FROM "Your App <noreply@yourdomain.com>" --prod
bunx convex env set APP_NAME "Your App" --prod
bunx convex env set RESEND_TEST_MODE false --prod
```

## Stack

Frontend: [TanStack Start](https://tanstack.com/start) (SSR), [TanStack Router](https://tanstack.com/router), [TanStack Query](https://tanstack.com/query), [TanStack Form](https://tanstack.com/form), React 19, [Tailwind v4](https://tailwindcss.com) (OKLch), [shadcn/ui](https://ui.shadcn.com), [Zod v4](https://zod.dev).

Backend: [Convex](https://convex.dev), [Better Auth](https://better-auth.com) via [`@convex-dev/better-auth`](https://github.com/get-convex/better-auth), [`convex-helpers`](https://github.com/get-convex/convex-helpers), [`@convex-dev/rate-limiter`](https://github.com/get-convex/rate-limiter), [`@convex-dev/resend`](https://github.com/get-convex/resend).

## Database Schema

Identity fields (`name`, `email`, `username`, `image`, `emailVerified`) live on the Better Auth user and belong to `@convex-dev/better-auth`. The local `users` table stores only what Better Auth can't: bio and a Convex storage id for the uploaded avatar. `safeGetAuthenticatedUser` in [`convex/auth.ts`](convex/auth.ts) merges both.

`users`:

| Field | Type | Description |
| --- | --- | --- |
| `authId` | `string` | FK to Better Auth user id (indexed) |
| `bio` | `string?` | user bio |
| `avatar` | `Id<'_storage'>?` | storage id for uploaded avatar |
| `createdAt` | `number` | creation timestamp |
| `updatedAt` | `number` | last update timestamp |

Indexes: `authId`, `createdAt`.

## Authentication

Sign in with email + password or username + password. Sign up asks for name, email, password (required) plus username and avatar (optional). Username is 3-30 chars, alphanumeric + `_` and `.`, checked against 17 reserved names in [`convex/constants.ts`](convex/constants.ts), with a 500ms-debounced availability check. Avatars are `image/*`, max 5MB, stored in Convex. Email verification is an OTP through the Better Auth `emailOTP` plugin delivered via Resend.

Sessions expire in 7 days, refresh after 1 day, fresh window is 10 minutes, cookie cache is 5 minutes (compact strategy).

Auth rate limits (HTTP layer):

| Endpoint | Limit |
| --- | ---: |
| `/sign-in/*` | 5/min |
| `/sign-up/*` | 3/min |
| `/email-otp/request-password-reset` | 3/hour |
| `/email-otp/reset-password` | 3/min |
| `/email-otp/send-verification-otp` | 3/min |
| `/list-sessions` | 30/min |
| `/get-session` | 60/min |

SSR auth works because the root route fetches the auth token via `createServerFn`, sets it on `convexQueryClient` before render, and hands it off to the client on hydrate. Authenticated queries work during SSR.

Every auth action (sign-in, sign-up, sign-out, change password, forgot/reset, update email, resend verification, delete account, list/revoke sessions) is handled by Better Auth. Call them from components with `authClient.*` ([`src/lib/auth-client.ts`](src/lib/auth-client.ts)). Routes live at `/api/auth/*`, registered on the Convex HTTP router in [`convex/http.ts`](convex/http.ts).

## Function Wrappers

[`convex/functions.ts`](convex/functions.ts) exports custom query/mutation wrappers that inject `ctx.user`:

- `authQuery` / `authMutation`: throws if unauthenticated, `ctx.user` is guaranteed.
- `optionalAuthQuery`: `ctx.user` may be `undefined`, use for public reads that tailor per-user.

## Rate Limiting

Token bucket via [`@convex-dev/rate-limiter`](https://github.com/get-convex/rate-limiter):

| Name | Rate | Burst | Use |
| --- | ---: | ---: | --- |
| `apiRead` | 100/min | 20 | HTTP GET |
| `apiWrite` | 30/min | 10 | HTTP POST/PUT |
| `userAction` | 60/min | 10 | authenticated user actions |
| `criticalAction` | 10/min | 5 | sensitive ops |

## HTTP API

Defined in [`convex/http.ts`](convex/http.ts) with CORS from `SITE_URL`.

| Method | Path | Auth | Limit |
| --- | --- | :---: | :---: |
| `GET` | `/api/health` | no | no |
| `GET` | `/api/users?id=<userId>` | no | `apiRead` |
| `GET` | `/api/users/list?cursor=...&limit=...` | no | `apiRead` |
| `*` | `/api/auth/*` |  | see auth limits |

## Routes

| Path | File | Auth |
| --- | --- | :---: |
| `/` | `index.tsx` | no |
| `/auth` | `auth.tsx` | no (redirects if signed in) |
| `/profile` | `profile.tsx` | yes (redirects to `/auth?redirect=/profile`) |
| `/api/auth/*` | `api/auth/$.ts` |  |
| `/*` | `$.tsx` | no (404) |

## Scripts

| Script | Description |
| --- | --- |
| `setup` | wipe, reinstall, configure Convex + Resend |
| `setup:local` | same, with Docker Convex |
| `dev` | Vite dev server on :3000 |
| `build` | production build |
| `serve` | preview build |
| `lint` | ESLint |
| `format` | Prettier |
| `check` | Prettier write + ESLint fix |
| `cleanup` | nuke deps and build artifacts, reinstall |

Do not edit `convex/_generated/` or `src/routeTree.gen.ts`. Convex and TanStack Router regenerate them.

## Deploy

Ship Convex to prod:

```bash
bunx convex deploy --cmd "bun run build"
```

Then set the prod env vars on Convex (see the env var section above) and the two client vars on your host.

## License

MIT
