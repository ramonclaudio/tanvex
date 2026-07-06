# Audit

Repo audit against the five CI gates, the Convex guidelines in
`convex/_generated/ai/guidelines.md`, `DESIGN.md`, and the tanstack-cn template
conventions. Every finding lists file, severity (blocker, should-fix, nit), the problem,
the fix, and a status. Statuses update as fixes land.

## Phase 1 baseline: the five CI gates

CI runs install, typecheck, lint, fmt:check, test, build per package manager (bun, pnpm,
npm, yarn) from a clean checkout. Reproduced 2026-07-06 in a scratch clone.

| Gate      | bun (from `bun.lock`)                 | npm (fresh resolve) |
| --------- | ------------------------------------- | ------------------- |
| install   | pass (640 packages)                   | **FAIL: ERESOLVE**  |
| typecheck | pass                                  | blocked by install  |
| lint      | pass (0 warnings, 0 errors, 57 files) | blocked             |
| fmt:check | pass (76 files)                       | blocked             |
| test      | pass (2 files, 10 tests)              | blocked             |
| build     | pass (nitro output emitted)           | blocked             |

npm install failure from the clean clone:

```
npm error ERESOLVE unable to resolve dependency tree
npm error Found: better-auth@1.6.9
npm error Could not resolve dependency:
npm error peer better-auth@">=1.6.11 <1.7.0" from @convex-dev/better-auth@0.12.5
```

Root cause: `@convex-dev/better-auth` is caret-ranged (`^0.12.2`) while `better-auth` is
hard-pinned at 1.6.9 for the patch in `patches/`. On 2026-05-06 (the last green CI run)
the latest component release satisfied the pin. Releases 0.12.3 through 0.12.5 bumped the
peer floor to 1.6.11, so every lockfile-less install (the npm, pnpm, and yarn CI legs,
plus every fresh fork) broke with zero commits to this repo. Fix verified in the scratch
clone: with `@convex-dev/better-auth` pinned to `0.12.2`, a clean `npm install` passes
and all five gates pass (typecheck 0, lint 0, fmt:check 0, test 0, build 0).

A sixth data point for honesty: the local working tree failed the build gate before this
audit (`z.function(...).returns is not a function` from `@tanstack/router-generator`)
because the tree was a stale bun and npm hybrid with zod 4 deduped into a zod-3 consumer.
A clean `bun install` fixed it. Not a repo bug.

## Blockers

### B1. Clean npm installs fail (ERESOLVE)

- File: `package.json:65`
- Problem: `@convex-dev/better-auth: ^0.12.2` floats to 0.12.5, whose peer requires
  `better-auth >=1.6.11`. That is unsatisfiable against the pinned-and-patched
  `better-auth@1.6.9`. The npm CI leg and every non-bun fork are broken today.
- Fix: pin `@convex-dev/better-auth` to exactly `0.12.2` (its peer range `>=1.6.9 <1.7.0`
  matches the pin). A patched dependency's tightly-coupled adapter must not float.
- Status: fixed. Clean `npm install` plus all five gates verified green in a scratch
  clone with the pin.

## Should-fix

### S1. `getUser` and `listUsers` are public but only called from `http.ts`

- File: `convex/users.ts:47,80`, `convex/http.ts:160,212`
- Problem: both are `optionalAuthQuery` (public) with zero client callers. Only the HTTP
  actions invoke them. The guidelines say functions called only from other Convex code
  are `internal.*`. Worse, the IP rate limiting on `/api/users` and `/api/users/list` is
  theater: any client can call `api.users.listUsers` directly over the websocket,
  unmetered. Neither reads `ctx.user`, so the auth wrapper is also pointless.
- Fix: convert both to `internalQuery`, call via `internal.users.*` from `http.ts`, and
  clamp the limit once (it is currently clamped identically in both layers).
- Status: fixed. Both internalized, single clamp in the query, docstrings note the HTTP
  route as the only entry point.

### S2. Duplicate current-user endpoints

- File: `convex/auth.ts:251` (`getCurrentUser`), `convex/users.ts:33` (`getMe`)
- Problem: two public queries with identical validators, both returning
  `safeGetAuthenticatedUser(ctx) ?? null`. `user-menu.tsx` uses one, `profile.tsx` and
  `index.tsx` use the other. Two names for one query will diverge. The
  circular-dependency comment in `auth.ts` justifies `hasPassword` staying on the raw
  builder, not a duplicate current-user endpoint.
- Fix: delete `getCurrentUser` and point `user-menu.tsx` at `api.users.getMe`.
- Status: fixed.

### S3. `users.createdAt` duplicates `_creationTime`

- File: `convex/schema.ts:17`, `convex/auth.ts:71,227`
- Problem: `createdAt: Date.now()` is written at the same insert where Convex stamps
  `_creationTime`, and nothing reads it (the profile's "Member since" reads
  `_creationTime`). The schema's own header claims the table stores only what Better
  Auth can't represent. `updatedAt` stays: Convex has no update-time system field and
  the profile renders it.
- Fix: drop `createdAt` from the schema, the trigger insert, and `authUserValidator`.
  Existing deployments need a one-off unset backfill before pushing the narrowed schema.
- Status: fixed. Zero remaining reads confirmed by grep, typecheck green.

### S4. `generateAvatarUploadUrl` has no rate limit

- File: `convex/users.ts:157`
- Problem: mints upload URLs with no `rateLimitWithThrow` while all three sibling
  mutations have one. An authenticated client can loop it and push unbounded blobs into
  storage. It is also missing its `returns` validator.
- Fix: add the same `userAction` rate limit and `returns: v.string()`.
- Status: fixed.

### S5. Dead rate-limit config: `apiWrite` and `criticalAction`

- File: `convex/rateLimit.ts:32,48`, `convex/http.ts:28`
- Problem: neither bucket is consumed anywhere. `apiWrite` survives only as a dead
  literal in the `checkApiRateLimit` args union (never passed), `criticalAction` only in
  the type. Dead config in a template reads as wired-up when it isn't. The
  `args.name as RateLimitName` cast is also dead weight.
- Fix: delete both buckets, narrow the args union to the names actually passed, drop the
  cast.
- Status: fixed. Two buckets remain (`apiRead`, `userAction`), both consumed, union and
  type now match exactly and the cast is gone.

### S6. `checkApiRateLimit` returns a duration as an absolute time

- File: `convex/http.ts:38`
- Problem: the rate limiter's `retryAfter` is milliseconds until retry (verified in the
  `@convex-dev/rate-limiter` source: `retryAfter = -value / rate`), but the mutation
  returns it as `retryAt` and both HTTP handlers compute
  `Retry-After: (retryAt - Date.now()) / 1000`, which yields a large negative number on
  every 429. The JSON body's `retryAt` is equally wrong.
- Fix: return `retryAt: Date.now() + retryAfter` so the downstream math holds.
- Status: fixed. Covered by a convex-test case in Phase 3 (retryAt is in the future on
  a 429).

### S7. OTP sign-in silently creates accounts

- File: `convex/auth.ts:149`
- Problem: the `emailOTP` plugin leaves `disableSignUp` unset, so the "Email OTP"
  sign-in tab mints a brand-new account (name `""`) for any unknown email, bypassing the
  sign-up flow that collects name and username. Verified in the better-auth 1.6.9
  source: unknown emails get an OTP when the type is `sign-in` and `disableSignUp` is
  falsy.
- Fix: set `disableSignUp: true`. Unknown emails then get a silent no-send success (the
  plugin's built-in anti-enumeration behavior). The sign-up path is unaffected.
- Status: fixed. Verified in the plugin source that existing-user sends (including the
  unverified-account resend path) are untouched, only unknown-email sign-in sends stop.

### S8. Unvalidated `?redirect=` search param on sign-in

- File: `src/routes/sign-in.tsx:78,83,132`
- Problem: `validateSearch` accepts any string, and both `redirect({ to })` (which
  becomes a Location header during SSR) and `navigate({ to })` receive it verbatim.
  TanStack mangles most absolute URLs into paths, but relying on router internals for
  open-redirect safety is the wrong layer. Only same-origin paths are ever legitimate
  here (`_authed` produces `location.href`).
- Fix: accept only strings starting with `/` and not `//` in `validateSearch`.
- Status: fixed. Sanitized at the search-param boundary, so both the beforeLoad redirect
  and the post-auth navigate only ever see same-origin paths.

### S9. The better-auth patch carries an inert, misleading `package.json` hunk

- File: `patches/better-auth+1.6.9.patch:132-165`
- Problem: the load-bearing change is the `/change-password` fix in
  `dist/api/routes/update-user.mjs` (keep the current session, revoke only the others)
  plus its type updates. The `package.json` hunk rewrites better-auth's workspace deps
  to ephemeral `pkg.pr.new` snapshot URLs. Applied post-install it changes nothing about
  resolution, but it makes `npm ls` report the tree as invalid and implies a snapshot
  dependency that does not exist.
- Fix: drop the `package.json` hunk from the patch.
- Status: fixed. Patch reapplies cleanly to a fresh better-auth install, the reapply is
  idempotent, and `npm ls better-auth` reports a valid tree.

### S10. The hugeicons patch mutates the wrong package for a types-only problem

- File: `patches/@hugeicons+react+1.1.6.patch`, `package.json:71`
- Problem: `@hugeicons/core-free-icons` maps subpath types to per-icon `.d.ts` files it
  does not ship (4 type files against 10k JS modules, still true at 4.2.2). The patch
  works around that by injecting an ambient wildcard module into `@hugeicons/react`'s
  dist. That is a node_modules mutation, on a caret-ranged package (`^1.1.6` while
  1.1.9 is latest), where a version drift makes `apply-patches` fail the whole install.
  A repo-local declaration does the same job with zero patching.
- Fix: delete the patch and add the `declare module "@hugeicons/core-free-icons/*"`
  ambient declaration as a repo file.
- Status: fixed. Patch deleted, `src/hugeicons.d.ts` added, typecheck and lint green
  against a fresh unpatched `@hugeicons/react` install.

### S11. Neither patch's reason is written down

- File: `patches/`
- Problem: the job of a patch dir in a public template is to answer "why is this here
  and when can it go." Both patches are bare diffs. README only describes the mechanism.
- Fix: add `patches/README.md` with what the better-auth patch changes, why (the
  upstream `/change-password` fix is unreleased as of 1.6.23, verified against the
  published tarball), and the removal condition.
- Status: fixed. `patches/README.md` added. The hugeicons patch no longer exists (S10).

### S12. CI can rot with zero commits, and did

- File: `.github/workflows/ci.yml`
- Problem: only `bun.lock` is committed, so the npm, pnpm, and yarn legs fresh-resolve on
  every run. But CI only runs on push and PR. The registry drift that broke npm installs
  sat undetected for two months because nothing pushed. Fresh-resolving legs are the
  right early-warning design. They just need a clock.
- Fix: add a weekly `schedule:` trigger.
- Status: open

### S13. Unused production dependencies

- File: `package.json:72,75`
- Problem: `@opentelemetry/api` and `@tanstack/react-query-devtools` have zero imports
  in the repo. The former is an optional peer of `@better-auth/core` (guarded dynamic
  import, works without it). The latter looks like an intent to wire the query devtools
  panel that never happened.
- Fix: drop `@opentelemetry/api`. Move `@tanstack/react-query-devtools` to
  devDependencies and actually wire `ReactQueryDevtoolsPanel` into `devtools.tsx` next
  to the router panel.
- Status: open

### S14. Auth boundary components where DESIGN.md forbids them

- File: `src/components/user-menu.tsx:24-32`, `src/routes/index.tsx:121-137`
- Problem: DESIGN.md's explicit Do: use `useConvexAuth` plus a conditional instead of
  `<Authenticated>` / `<Unauthenticated>` / `<AuthLoading>` until the upstream isLoading
  latch ships. Better Auth refetches the session on every window focus, which flips
  `isLoading` and unmounts boundary children. In the header that renders as the avatar
  flashing to a skeleton on each focus.
- Fix: convert both to `useConvexAuth` conditionals keyed on the stable
  `isAuthenticated`.
- Status: fixed. Both carry the `UPSTREAM(convex-better-auth#isloading-latch)` tag like
  the existing call sites.

### S15. The `cn-toast` class is applied but defined nowhere

- File: `src/components/ui/sonner.tsx:39`, `src/styles.css`, `DESIGN.md:227,257`
- Problem: DESIGN.md documents "`cn-toast` applies `rounded-2xl` over Sonner defaults".
  Grep finds the class only in `sonner.tsx` and DESIGN.md. Toasts actually render at
  `--radius` (10px). The radius ladder line separately claims toasts are `rounded-xl`.
  Three values, one of them real.
- Fix: define `.cn-toast { border-radius: var(--radius-2xl) }` in `styles.css` and align
  the ladder line.
- Status: fixed. Design lint unchanged (0 errors, same 9 pre-existing warnings as HEAD).

### S16. `vite-env.d.ts` types env vars that never exist on `import.meta.env`

- File: `src/vite-env.d.ts`
- Problem: declares `VITE_CONVEX_SITE_URL`, `CONVEX_DEPLOYMENT`, and `SITE_URL` on
  `ImportMetaEnv`, but those flow through `process.env` via the vite.config `define`
  block (`auth-server.ts` reads `process.env.VITE_CONVEX_SITE_URL`). False type safety:
  `import.meta.env.SITE_URL` typechecks and is undefined at runtime.
- Fix: keep only the `VITE_`-prefixed vars on `ImportMetaEnv` (Vite auto-exposes those
  three). `CONVEX_DEPLOYMENT` and `SITE_URL` never exist there.
- Status: fixed, with a comment pointing at the define block for the server-side vars.

### S17. Canonical URL and `og:url` claim every page is the homepage

- File: `src/routes/__root.tsx:118`, `src/lib/seo.ts`
- Problem: the root route hardcodes `rel=canonical` to `SITE_URL` and calls `seo()` with
  no `url`, and no child route overrides either. `/sign-in` canonicalizes to `/`.
- Fix: per-route `head` with `seo({ url })` and a canonical link on each route.
- Status: open

### S18. The home page hardcodes what `site.ts` already exports

- File: `src/routes/index.tsx:38-39,261,277`
- Problem: a local `REPO_URL` const duplicates `site.ts:17`, and the clone command and
  footer author links repeat the literals. A forker following README's customize section
  updates `site.ts` and still ships the author's URLs on the landing page.
- Fix: import `REPO_URL` and `AUTHOR_URL` from `@/lib/site` and derive the clone command.
- Status: open

### S19. README drift (multiple, confirmed against source)

- File: `README.md:88,128,132,199-209,32-49`
- Problem, four counts: (1) "Security headers … pinned in the shipped `vercel.json`,
  `netlify.toml`, and `wrangler.toml`" is wrong. The headers live in `vite.config.ts`
  Nitro routeRules, platform-neutral, which is better than the claim. (2) The project
  tree omits `convex/functions.ts` (the wrapper layer the whole backend builds on),
  `convex.config.ts`, `constants.ts`, and `errors.ts`. (3) "`SITE_NAME` # used in
  `<title>` suffix" is false, it never is. (4) The scripts table omits `dev:web` and
  `convex:dev`.
- Fix: correct all four.
- Status: open

### S20. `llms.txt` and `llms-full.txt` describe scripts that don't exist

- File: `public/llms-full.txt:54,109,135`, `public/llms.txt:21`
- Problem: they claim the setup CLI "uses Bun APIs (`Bun.spawn`, `Bun.$`, `Bun.file`)".
  Zero `Bun.*` calls exist. The scripts are deliberately runtime-agnostic node builtins.
  They also claim `seo.ts` emits canonical (it doesn't, `__root.tsx` does) and
  misdescribe the `clean` chain (it runs `oxfmt` and `oxlint --fix`, not `fmt:check` and
  `lint`).
- Fix: match both files to reality.
- Status: open

### S21. `.gitignore` ignores its own committed template

- File: `.gitignore:7`
- Problem: `.env.*` matches `.env.convex.example`. Only `.env.example` is whitelisted.
  The file survives because it is already tracked, but ignore-respecting tools (ripgrep,
  some editors) hide it.
- Fix: add `!.env.convex.example`.
- Status: open

### S22. `clean` requires a binary that only exists on the author's machine

- File: `scripts/clean.ts:123`
- Problem: shells out to a bare `trash` that is neither a devDependency nor present on
  Linux, Windows, or CI. The documented "full reset" script fails for anyone not on a
  Mac with `trash` installed.
- Fix: add `trash-cli` as a devDependency (a cross-platform `trash` bin lands on the
  run-script PATH).
- Status: open

## Nits

### N1. `updateAvatar` stores dangling storage ids silently

- File: `convex/users.ts:169`. `v.id("_storage")` validates shape only. A bad id patches
  through and `getUrl` returns null downstream. Self-inflicted only (ids are
  unguessable). Fix: existence check via `ctx.db.system.get` plus `validationError`.
  Status: fixed, covered by a Phase 3 test.

### N2. Missing `returns` validators

- File: `convex/email.ts:28`, `convex/crons.ts:19`, `convex/auth.ts:281`.
  `handleEmailEvent`, `cleanupResend`, and `rotateKeys` lack `returns` while every other
  function declares one. Fix: add `v.null()` to all three. Status: fixed.

### N3. Bio textarea forks the installed primitive and skips the 500-char mirror

- File: `src/routes/_authed/profile.tsx:590`. An inline `<textarea>` re-implements the
  `ui/textarea.tsx` classes, with no `maxLength` while the server rejects over 500.
  Fix: use the `Textarea` primitive with `maxLength={500}`. Status: open.

### N4. Profile loader threads an `error` field nothing reads

- File: `src/routes/_authed/profile.tsx:30-43`. `fetchProfileData` returns
  `{ user, error }` but the component reads only `preloadedUser`. Fix: drop the field.
  Status: open.

### N5. Reset-password confirmation is set and immediately unmounted

- File: `src/routes/sign-in.tsx:832-833`. `setInfo(...)` then `resetToSignIn()` swaps
  the phase, so "Password updated. Sign in with your new password." never renders.
  Fix: move the confirmation to a toast (Sonner is already mounted). Status: open.

### N6. Header icons off the size ladder

- File: `src/components/theme-toggle.tsx:22,26`, `src/routes/__root.tsx:168`.
  `size-[1.2rem]` is not a DESIGN.md ladder step. Fix: `size-5`. Status: open.

### N7. `"use client"` in `field.tsx`

- File: `src/components/ui/field.tsx:1`. An RSC directive, inert in TanStack Start, the
  only file with it. Fix: drop the line. Status: open.

### N8. DESIGN.md component notes drift from the implementation

- File: `DESIGN.md:246,374`. The avatar fallback is documented as "user initial" but
  renders a glyph. ThemeToggle is documented as "cycling" but is a menu. Fix: match the
  docs to the code and re-run the design lint. Status: open.

### N9. `oxlint-tsgolint` caret-ranged while oxlint and oxfmt are exact

- File: `package.json:108`. The type-aware backend is coupled to the pinned oxlint.
  Fix: pin exact like oxlint and oxfmt. Status: open.

### N10. bun-only commands in shipped, PM-neutral files

- File: `.env.example:5`, `.env.convex.example` (throughout), `convex/origins.ts:16-17`.
  Comments hardcode `bun run` and `bunx` in files that ship to users of any PM, against
  the tanstack-cn convention. README documents multi-PM usage properly. Fix: shipped
  comments use `npx convex` and `npm run`, the baseline every environment has.
  Status: open.

## Accepted or refuted (no change, reasons recorded)

- **`reportWebVitals` is a prod no-op** (`src/lib/report-web-vitals.ts`): intentional
  ready-to-wire scaffolding with the swap point commented. Documented choice.
- **OTP in the email subject** (`convex/email.ts:76`): deliberate. It enables
  notification autofill, and GitHub and Stripe do the same.
- **JSON-LD `runtimePlatform: "Bun"`** (`src/routes/__root.tsx:68`): the demo deploys on
  bun-pinned hosts. Defensible metadata about the author's deployment.
- **`authQuery` exported but unused**: the strict member of the deliberate wrapper pair,
  documented with an example, and exercised by the Phase 3 tests.
- **`fetchAuthMutation` and `fetchAuthAction` re-exports** (`src/lib/auth-server.ts`):
  public module surface of the integration, not dead locals.
- **Dropdown destructive-item important-flag overrides**
  (`src/components/ui/dropdown-menu.tsx:42`): the canonical base-luma translucent recipe
  as shipped by the shadcn registry. Changing it would diverge from the documented
  reinstall-from-registry upkeep, and no destructive item is rendered anywhere yet.
- **`eslint-disable react-refresh/only-export-components`**
  (`src/components/theme-provider.tsx:1`): load-bearing. Oxlint honors eslint-disable
  directives and aliases the react-refresh rule name, and the file legitimately exports
  a component plus a hook.
- **bun pins in `vercel.json`, `netlify.toml`, `wrangler.toml`**: documented deploy
  decision in README. The build host's PM is independent of the developer's.
- **`nitro` prerelease caret**: the Nitro 3 beta is the required baseline for TanStack
  Start. No stable exists to hold on.
- **`getSiteUrl` falls back to localhost in prod** (`convex/origins.ts:39`): it logs a
  CRITICAL error. Throwing at module load would brick the deploy ordering (env vars land
  after the first push). Documented in the docstring.
- **Avatar upload can orphan a blob if `updateAvatar` never runs** (`profile.tsx`,
  `sign-in.tsx`): accepted for a starter. Storage ids are unguessable, volume is
  rate-limited once S4 lands, and a sweep cron is over-engineering here.
- **`setup.ts` uses `fs.rm` while `clean.ts` uses `trash`**: different contracts, both
  documented in their headers. Setup resets a possibly-broken tree from scratch. Clean
  is the recoverable reset.

## Phase 3: verification (planned)

Target state: five gates green locally and from a clean clone with both npm and bun,
compared against the Phase 1 baseline above.

Convex function tests to add under `convex/*.test.ts` (convex-test, `edge-runtime`
environment per file, no live backend):

- auth enforcement on the wrappers: `authQuery` and `authMutation` reject
  unauthenticated callers, `optionalAuthQuery` passes an undefined user
- profile mutations: bio validation (accept up to 500, reject over 500, clear on empty),
  avatar storage-id handling (existence check, old-blob deletion)
- rate-limit consumption: the `userAction` bucket exhausts and throws, and
  `checkApiRateLimit` returns an absolute `retryAt`

### Known testing gap

To be confirmed during Phase 3: the Better Auth component backs
`safeGetAuthenticatedUser` via component calls that need the component's own tables and
runtime. If registering it under convex-test proves infeasible without a live
deployment, the wrapper tests will drive whatever surface is reachable and this section
will record exactly what is not covered. OTP delivery, session cookies, and the SSR
token flow need a real deployment plus Resend and are out of scope per the audit brief
(no cloud resources provisioned).

## Phase 4: README execution check (planned)

Every README step that needs no external account gets executed and recorded here. Steps
that cannot run without cloud resources (`setup`, `dev`, the Resend webhook, the deploy
walkthroughs) will be listed with reasons.
