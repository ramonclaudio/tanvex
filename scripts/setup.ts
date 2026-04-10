#!/usr/bin/env bun
/**
 * tanvex bootstrapper.
 *
 * Resets the project to a clean state and walks through Convex + Better
 * Auth + Resend setup. Wipes node_modules, lockfile, build artifacts, and
 * generated files, then reinstalls deps and configures environment.
 *
 * Use for fresh installs or to reset a broken project. Convex deployment
 * env vars survive a re-run (not rotated), but for one-off changes use
 * `bunx convex env set NAME VALUE` directly instead of re-running setup.
 *
 * All progress output goes to stderr so the script composes cleanly in pipes.
 *
 * Usage:
 *   bun run setup               cloud Convex, interactive
 *   bun run setup --local       self-hosted / local Convex backend
 *   bun run setup --fresh       provision a NEW Convex deployment (nuclear)
 *   bun run setup --no-resend   skip Resend env prompts
 *   bun run setup --version     print Bun version and exit
 *   bun run setup --help        print usage and exit
 *
 * Exit codes:
 *   0   success
 *   1   runtime error (shell, writes, missing state)
 *   2   invalid CLI flag
 *   130 SIGINT (Ctrl+C)
 *   143 SIGTERM
 */

// This file requires Bun. Running it with `node scripts/setup.ts` will fail
// at the `import { $ } from 'bun'` line below with ERR_MODULE_NOT_FOUND —
// which is already a clear error, so there's no synchronous guard to add.

import { $ } from 'bun'
import { rm } from 'node:fs/promises'
import { parseArgs } from 'node:util'

// ─── Shell defaults ──────────────────────────────────────────────────────────
// - Explicit throws(true) for clarity; matches the default but documents intent.
// - $.cwd anchors all child processes to the repo root so the script works
//   when invoked from any directory (including symlinked bin paths).
$.throws(true)
$.cwd(new URL('..', import.meta.url).pathname)

// ─── Output: everything goes to stderr ───────────────────────────────────────
// A setup script has no primary output — all of this is progress. Writing to
// stderr lets users do `bun run setup >/dev/null` to hide the interactive
// command's stdout while still seeing our progress, or `2>/dev/null` for
// total silence.
//
// Bun.color() auto-honors NO_COLOR / FORCE_COLOR and returns "" on no-color
// terminals, so the script stays readable in CI logs and pipes.

const RESET = '\x1b[0m'
const BOLD = '\x1b[1m'
const DIM = '\x1b[2m'
const GREEN = Bun.color('#22c55e', 'ansi') ?? ''
const RED = Bun.color('#ef4444', 'ansi') ?? ''
const YELLOW = Bun.color('#f59e0b', 'ansi') ?? ''
const VIOLET = Bun.color('#a78bfa', 'ansi') ?? ''

const write = (s: string) => process.stderr.write(s)
const line = (s = '') => process.stderr.write(s + '\n')

const ok = (msg: string) => line(`  ${GREEN}ok${RESET}   ${msg}`)
const nop = (msg: string) => line(`  ${DIM}--   ${msg}${RESET}`)
const yep = (msg: string) => line(`  ${YELLOW}!!${RESET}   ${msg}`)
const bad = (msg: string) => line(`  ${RED}xx${RESET}   ${RED}${msg}${RESET}`)
const note = (msg: string) => line(`       ${DIM}${msg}${RESET}`)

function section(title: string): void {
  const w = process.stderr.columns ?? process.stdout.columns ?? 80
  const fill = '─'.repeat(Math.max(0, w - Bun.stringWidth(title) - 3))
  line(`\n${BOLD}${VIOLET}${title}${RESET} ${DIM}${fill}${RESET}`)
}

// ─── Interactive prompt ──────────────────────────────────────────────────────
// The browser-standard `prompt()` global in Bun writes to stdout — we need the
// question on stderr to preserve the "all progress to stderr" invariant. Bun's
// `console` is an AsyncIterable of stdin lines, so we drive the read loop
// ourselves and write the question through `process.stderr.write`.

async function ask(question: string): Promise<string> {
  write(question)
  for await (const raw of console) return raw.trim()
  return ''
}

/**
 * Y/n confirmation. Case-insensitive, falls back to `defaultYes` on empty
 * input (and also on non-TTY, since `ask()` returns '' without blocking).
 * Uses the same stderr writer as `ask()` so output stream discipline is
 * preserved.
 */
async function askYesNo(question: string, defaultYes: boolean): Promise<boolean> {
  const hint = defaultYes ? 'Y/n' : 'y/N'
  const raw = (
    await ask(`  ${question} ${DIM}[${hint}] >${RESET} `)
  ).toLowerCase()
  if (!raw) return defaultYes
  return raw === 'y' || raw === 'yes'
}

// ─── Args ────────────────────────────────────────────────────────────────────

const HELP = `${BOLD}tanvex setup${RESET}

${BOLD}Usage:${RESET}
  ${DIM}bun run setup${RESET}                cloud Convex (interactive)
  ${DIM}bun run setup --local${RESET}        self-hosted / local Convex backend
  ${DIM}bun run setup --fresh${RESET}        provision a NEW Convex deployment
                               (wipes ${DIM}.env.local${RESET}; use after schema
                               refactors that reject old rows)
  ${DIM}bun run setup --no-resend${RESET}    skip Resend prompts (auth flows will
                               be broken until you set RESEND_API_KEY)
  ${DIM}bun run setup --version${RESET}      print Bun version and exit
  ${DIM}bun run setup --help${RESET}         this message

Wipes node_modules, lockfile, build artifacts, and generated files, then
reinstalls deps and walks through Convex + Better Auth + Resend setup.
Use this for fresh installs or to reset a broken project.

By default, ${DIM}CONVEX_DEPLOYMENT${RESET} in ${DIM}.env.local${RESET} survives a re-run and setup
reconnects to the same backend. Pass ${DIM}--fresh${RESET} to create a new Convex
project instead. Stale data, deployment env vars, and webhook configs on
the old deployment are all left behind. For one-off env var changes on a
working project, use ${DIM}bunx convex env set NAME VALUE${RESET} directly instead of
re-running setup.

${BOLD}Note:${RESET} Resend is required by this codebase. Sign-up, sign-in,
verification, password reset, and email change all need email delivery.
`

type Args = {
  local?: boolean
  fresh?: boolean
  'no-resend'?: boolean
  version?: boolean
  help?: boolean
}

let args: Args
try {
  args = parseArgs({
    args: Bun.argv.slice(2),
    options: {
      local: { type: 'boolean', default: false },
      fresh: { type: 'boolean', default: false },
      'no-resend': { type: 'boolean', default: false },
      version: { type: 'boolean', short: 'v', default: false },
      help: { type: 'boolean', short: 'h', default: false },
    },
    strict: true,
  }).values as Args
} catch (err) {
  bad(err instanceof Error ? err.message : String(err))
  note('try: bun run setup --help')
  process.exit(2)
}

if (args.help) {
  line(HELP)
  process.exit(0)
}

if (args.version) {
  line(`bun ${Bun.version} (${Bun.revision.slice(0, 7)})`)
  process.exit(0)
}

// ─── Signals ─────────────────────────────────────────────────────────────────
// Handle both SIGINT (Ctrl+C) and SIGTERM (process manager shutdown) so the
// script never leaves a half-ANSI-colored terminal or confusing stack trace.
// Also ensures any running `convex dev` child is killed before we exit — the
// main-loop `finally` normally handles this, but a signal can bypass it.

/**
 * Handle to a running `convex dev` subprocess. The persistent dev session
 * must be `stop()`ed before the setup script exits so we don't leak a dev
 * server into the user's environment.
 */
type ConvexDevHandle = {
  stop: () => Promise<void>
}

// Set by stepConvexDev once the background `convex dev` process is running.
// Held at module scope so the signal handlers can reach it.
let activeConvexDev: ConvexDevHandle | undefined

const shutdown = (code: number, label: string, hint: string): void => {
  line(`\n${YELLOW}${label}${RESET} ${DIM}${hint}${RESET}`)
  // Don't await — signal handlers should be synchronous. If the dev process
  // is still running, fire a kill and let it die on its own.
  activeConvexDev?.stop().catch(() => {})
  process.exit(code)
}

process.on('SIGINT', () => shutdown(130, 'interrupted', '(Ctrl+C)'))
process.on('SIGTERM', () => shutdown(143, 'terminated', '(SIGTERM)'))

// ─── Env file I/O ────────────────────────────────────────────────────────────

const ENV_FILE = '.env.local'

/**
 * Parse `.env.local` into a Map. Handles inline comments (` # ...` after the
 * value) and surrounding whitespace — critical because Convex writes lines
 * like `CONVEX_DEPLOYMENT=dev:foo # team: bar, project: baz` and a naive
 * split-on-`=` parser would pollute process.env with the comment tail.
 */
async function readEnvFile(): Promise<Map<string, string>> {
  const file = Bun.file(ENV_FILE)
  const out = new Map<string, string>()
  if (!(await file.exists())) return out
  for (const raw of (await file.text()).split('\n')) {
    const trimmed = raw.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const eq = trimmed.indexOf('=')
    if (eq <= 0) continue
    const key = trimmed.slice(0, eq).trim()
    let value = trimmed.slice(eq + 1).trim()
    // Strip optional surrounding quotes, then an inline comment introduced
    // by whitespace followed by `#`. Leaves `#` inside quoted values alone.
    const quoted = /^(['"])(.*)\1\s*(?:#.*)?$/.exec(value)
    if (quoted) {
      value = quoted[2]
    } else {
      const hashAt = value.search(/\s#/)
      if (hashAt >= 0) value = value.slice(0, hashAt).trim()
    }
    out.set(key, value)
  }
  return out
}

/**
 * Append `KEY=VALUE` to `.env.local` if (and only if) the key is not already
 * present. Preserves the original file contents, including comments and blank
 * lines — unlike a rewrite-from-Map approach, which would silently strip the
 * `# Deployment used by \`npx convex dev\`` header the Convex CLI writes.
 *
 * Safe to call repeatedly: the regex check makes this a no-op if the key is
 * already set.
 */
async function ensureEnvLocalLine(key: string, value: string): Promise<void> {
  const file = Bun.file(ENV_FILE)
  const current = (await file.exists()) ? await file.text() : ''
  // Match `KEY=` only at the start of a line so commented-out `# KEY=...` is ignored.
  if (new RegExp(`^${key}=`, 'm').test(current)) return
  const needsNewline = current !== '' && !current.endsWith('\n')
  await Bun.write(ENV_FILE, `${current}${needsNewline ? '\n' : ''}${key}=${value}\n`)
}

// ─── Convex helpers ──────────────────────────────────────────────────────────

async function convexEnvMap(): Promise<Map<string, string>> {
  // Pin to the currently-active deployment via `--deployment` so we don't
  // accidentally read from a stale one inherited via env-var.
  const deployment = deploymentNameFromEnvValue(process.env.CONVEX_DEPLOYMENT)
  const argv = ['bunx', 'convex', 'env', 'list']
  if (deployment) argv.push('--deployment', deployment)
  const proc = Bun.spawn(argv, { stdin: 'ignore', stdout: 'pipe', stderr: 'pipe' })
  const out = new Map<string, string>()
  const code = await proc.exited
  if (code !== 0) return out
  const text = await new Response(proc.stdout).text()
  for (const raw of text.split('\n')) {
    const trimmed = raw.trim()
    if (!trimmed) continue
    const eq = trimmed.indexOf('=')
    if (eq > 0) out.set(trimmed.slice(0, eq), trimmed.slice(eq + 1))
  }
  return out
}

/**
 * Strip the `dev:` / `prod:` prefix from a CONVEX_DEPLOYMENT value to get the
 * bare deployment name. The env-var form requires the prefix; the CLI's
 * `--deployment` flag rejects it and expects just `name`. Yes, these two are
 * inconsistent — verified empirically.
 */
function deploymentNameFromEnvValue(value: string | undefined): string | undefined {
  if (!value) return undefined
  const m = /^(?:dev|prod|preview):(.+)$/.exec(value)
  return m ? m[1] : value
}

/**
 * Run `bunx convex env set NAME VALUE` through Bun.spawn with the explicit
 * `--deployment <name>` flag. We pass the deployment explicitly (instead of
 * relying on CONVEX_DEPLOYMENT env-var inheritance) so child processes can
 * never target a stale deployment from the parent's startup-time env.
 *
 * stdin is closed so the CLI can't hang on an interactive retry prompt;
 * stderr is captured for error reporting; a hard timeout kills the process
 * if it gets stuck on flaky network state.
 */
async function runConvexEnvSetOnce(
  name: string,
  value: string,
): Promise<{ exitCode: number; stderr: string }> {
  const deployment = deploymentNameFromEnvValue(process.env.CONVEX_DEPLOYMENT)
  const argv = ['bunx', 'convex', 'env', 'set']
  if (deployment) argv.push('--deployment', deployment)
  argv.push(name, value)
  const proc = Bun.spawn(argv, {
    stdin: 'ignore',
    stdout: 'pipe',
    stderr: 'pipe',
  })
  const timer = setTimeout(() => proc.kill(), 15_000)
  try {
    const exitCode = await proc.exited
    const stderr = await new Response(proc.stderr).text()
    return { exitCode, stderr }
  } finally {
    clearTimeout(timer)
  }
}

/**
 * Set a Convex env var. Single attempt — the persistent `convex dev` process
 * held open by `stepConvexDev` keeps the deployment session alive, so writes
 * should succeed immediately. On failure, throw with the stderr tail so the
 * user sees the real CLI error.
 */
async function convexEnvSet(name: string, value: string): Promise<void> {
  const res = await runConvexEnvSetOnce(name, value)
  if (res.exitCode === 0) return
  const tail = res.stderr.trim().split('\n').pop()?.trim() ?? `exit ${res.exitCode}`
  throw new Error(`convex env set ${name} failed: ${tail}`)
}


// ─── Crypto: 32 random bytes, base64, web-standard ───────────────────────────

function base64Secret(): string {
  const buf = new Uint8Array(32)
  crypto.getRandomValues(buf)
  return btoa(String.fromCharCode(...buf))
}

// ─── Defaults derived from package.json ──────────────────────────────────────
// Read lazily inside the step that needs them so `--help` and `--version`
// don't pay the I/O cost.

async function deriveAppName(): Promise<string> {
  try {
    const pkg = (await Bun.file('package.json').json()) as { name?: unknown }
    if (typeof pkg.name !== 'string' || !pkg.name) return 'App'
    // Strip "@scope/" prefix if present, then title-case hyphens/underscores.
    const clean = pkg.name.replace(/^@[^/]+\//, '')
    const parts = clean.split(/[-_]/).filter(Boolean)
    if (parts.length === 0) return 'App'
    return parts.map((w) => w[0]!.toUpperCase() + w.slice(1)).join(' ')
  } catch {
    return 'App'
  }
}

// ─── Steps ───────────────────────────────────────────────────────────────────

/**
 * Wipe local state and reinstall dependencies. The wipe list mirrors what
 * was previously the standalone `bun run cleanup` script: build artifacts,
 * generated files, the lockfile, and node_modules. `.env.local` is NOT
 * touched by default, so `CONVEX_DEPLOYMENT` survives and the next
 * `convex dev --once` reconnects to the same backend.
 *
 * When `fresh` is true, `.env.local` is also wiped so that the subsequent
 * `convex dev --once --configure new` writes a clean set of Convex values
 * instead of inheriting the old deployment's `VITE_CONVEX_SITE_URL`.
 *
 * Setup is the entry point for fresh installs and full resets. For one-off
 * env var changes on a working project, use `bunx convex env set` directly
 * instead of re-running setup.
 */
async function stepCleanup(fresh: boolean): Promise<void> {
  section('Clean install')
  const targets = [
    'node_modules',
    'bun.lock',
    'dist',
    '.output',
    '.nitro',
    '.tanstack',
    '.vite',
    '.cache',
    'convex/_generated',
    'src/routeTree.gen.ts',
    'tsconfig.tsbuildinfo',
    ...(fresh ? [ENV_FILE] : []),
  ]
  // `force: true` swallows ENOENT, so a fresh clone (where most of these
  // don't exist yet) is a no-op rather than an error.
  await Promise.all(
    targets.map((t) => rm(t, { recursive: true, force: true })),
  )
  ok(
    fresh
      ? `wiped node_modules, lockfile, build artifacts, and ${ENV_FILE}`
      : 'wiped node_modules, lockfile, and build artifacts',
  )

  // Stream `bun install` so the user sees progress on what is typically
  // the slowest step. Throws on non-zero exit, caught by main's try/catch.
  const proc = Bun.spawn(['bun', 'install'], {
    stdio: ['inherit', 'inherit', 'inherit'],
  })
  const code = await proc.exited
  if (code !== 0) throw new Error(`bun install exited with code ${code}`)
  ok('bun install')
}

/**
 * Spawn `convex dev` (without --once) and wait for the initial push to
 * finish. The dev process stays alive while we run `convex env set` calls,
 * which is what the Convex CLI expects: `--once` exits before the backend
 * fully registers the deployment for write-endpoint auth, so subsequent
 * env writes 403 with "You don't have access to the selected project".
 * Keeping dev alive holds an authenticated session and makes env writes
 * work immediately.
 *
 * Returns a handle the caller must `stop()` before the script exits.
 */
async function stepConvexDev(
  useLocal: boolean,
  fresh: boolean,
): Promise<ConvexDevHandle> {
  section('Convex deployment')
  const cmd = ['bunx', 'convex', 'dev']
  if (useLocal) cmd.push('--local')
  if (fresh) cmd.push('--configure', 'new')
  // Disable log tailing so the dev process doesn't spam stdout forever
  // while we're running env ops — we only care about the initial push.
  cmd.push('--tail-logs', 'disable')

  // Pipe stdio so we can watch for the "Convex functions ready!" marker
  // *and* stream output to stderr so the user sees configure prompts and
  // progress in real time.
  const proc = Bun.spawn(cmd, {
    stdin: 'inherit', // configure prompts need real stdin
    stdout: 'pipe',
    stderr: 'pipe',
  })

  let ready = false
  let exited = false
  const readyMarker = /Convex functions ready!/

  const forward = async (stream: ReadableStream<Uint8Array>): Promise<void> => {
    const reader = stream.getReader()
    const decoder = new TextDecoder()
    for (;;) {
      const { done, value } = await reader.read()
      if (done) return
      const text = decoder.decode(value, { stream: true })
      process.stderr.write(text)
      if (!ready && readyMarker.test(text)) ready = true
    }
  }

  // Forward both streams in parallel but don't await them here — they only
  // resolve when the dev process exits. We just need to watch stdout for the
  // ready marker.
  void forward(proc.stdout).catch(() => {})
  void forward(proc.stderr).catch(() => {})

  // Track exit so we can fail fast if dev crashes before becoming ready.
  const exitPromise = proc.exited.then((code) => {
    exited = true
    return code
  })

  // Poll for readiness with a generous timeout. On first-run with component
  // installs, the initial push can take 30-60s.
  const deadline = Date.now() + 180_000
  while (!ready) {
    if (exited) {
      const code = await exitPromise
      throw new Error(`convex dev exited before becoming ready (code ${code})`)
    }
    if (Date.now() >= deadline) {
      proc.kill()
      throw new Error('convex dev did not become ready within 180s')
    }
    await Bun.sleep(250)
  }

  // Give Convex a moment to fully settle the just-pushed schema before we
  // start hammering the env write endpoint. Short enough to be invisible,
  // long enough to dodge obvious propagation races.
  await Bun.sleep(500)

  // Refresh process.env from the (now definitely up-to-date) .env.local so
  // child processes spawned by convexEnvSet inherit the NEW deployment.
  const freshEnv = await readEnvFile()
  for (const key of ['CONVEX_DEPLOYMENT', 'VITE_CONVEX_URL', 'VITE_CONVEX_SITE_URL']) {
    const value = freshEnv.get(key)
    if (value) process.env[key] = value
    else delete process.env[key]
  }
  note(`targeting deployment: ${process.env.CONVEX_DEPLOYMENT}`)

  return {
    stop: async () => {
      if (exited) return
      proc.kill('SIGTERM')
      // Give it a second to clean up, then force-kill.
      const raced = await Promise.race([
        exitPromise,
        Bun.sleep(2_000).then(() => 'timeout' as const),
      ])
      if (raced === 'timeout') proc.kill('SIGKILL')
      await exitPromise
    },
  }
}

async function stepLocalEnv(): Promise<void> {
  section('.env.local')
  const env = await readEnvFile()
  const deployment = env.get('CONVEX_DEPLOYMENT')
  if (!deployment) throw new Error(`CONVEX_DEPLOYMENT missing from ${ENV_FILE}`)
  const projectName = deployment.split('#')[0].trim().split(':')[1]
  if (!projectName) throw new Error(`invalid CONVEX_DEPLOYMENT: ${deployment}`)
  ok(`connected to ${BOLD}${projectName}${RESET}`)

  if (env.has('VITE_CONVEX_SITE_URL')) {
    nop('VITE_CONVEX_SITE_URL already set')
    return
  }
  await ensureEnvLocalLine('VITE_CONVEX_SITE_URL', `https://${projectName}.convex.site`)
  ok(`wrote VITE_CONVEX_SITE_URL to ${ENV_FILE}`)
}

async function stepAuthEnv(fresh: boolean): Promise<void> {
  section('Better Auth')
  // On --fresh we just provisioned a brand-new deployment, so any "already set"
  // reading from `convex env list` is either stale or a transient artifact of
  // component install. Bypass the skip and always (re)set the values, so a
  // successful setup run guarantees these exist on the Convex backend.
  const env = fresh ? new Map<string, string>() : await convexEnvMap()

  if (env.has('SITE_URL')) {
    nop('SITE_URL already set')
  } else {
    // SITE_URL is the origin your frontend serves from. Used for auth redirects
    // and cookie scoping. Default fits `bun run dev`; user can paste their own
    // for non-default ports or remote dev. Non-TTY runs fall back silently so
    // CI doesn't hang.
    const defaultUrl = 'http://localhost:3000'
    const siteUrl = process.stdin.isTTY
      ? (await ask(`  SITE_URL ${DIM}(${defaultUrl}) >${RESET} `)) || defaultUrl
      : defaultUrl
    await convexEnvSet('SITE_URL', siteUrl)
    ok(`set SITE_URL=${siteUrl}`)
  }

  if (env.has('BETTER_AUTH_SECRET')) {
    nop('BETTER_AUTH_SECRET already set (rotating would invalidate sessions)')
  } else {
    // Default is a 32-byte cryptographically random value, base64-encoded —
    // the web-crypto equivalent of `openssl rand -base64 32`. Pasting a custom
    // value lets the user migrate an existing secret from another deployment
    // without rotating sessions.
    const pasted = process.stdin.isTTY
      ? await ask(`  BETTER_AUTH_SECRET ${DIM}(Enter to auto-generate) >${RESET} `)
      : ''
    const autoGen = !pasted
    await convexEnvSet('BETTER_AUTH_SECRET', autoGen ? base64Secret() : pasted)
    ok(autoGen ? 'generated BETTER_AUTH_SECRET' : 'set BETTER_AUTH_SECRET from paste')
  }
}

/**
 * Warning shown whenever the user ends up without RESEND_API_KEY set —
 * either via --no-resend, a non-TTY environment, or an explicit "skip
 * anyway" confirmation in the prompt loop. The codebase requires Resend
 * for sign-up, sign-in (email + OTP), password reset, and change-email.
 */
function warnResendUnconfigured(): void {
  bad('RESEND_API_KEY is unset — auth flows will fail at runtime')
  note('sign-up, sign-in, password reset, and change-email all send OTPs')
  note('set later with: bunx convex env set RESEND_API_KEY re_...')
}

async function stepResend(skip: boolean, fresh: boolean): Promise<void> {
  section('Resend (email delivery — required)')

  // Same reasoning as stepAuthEnv: on --fresh the deployment is empty, any
  // "already set" reading is a transient artifact. Force full (re)prompting.
  const env = fresh ? new Map<string, string>() : await convexEnvMap()
  // stepLocalEnv already ensured VITE_CONVEX_SITE_URL is written, so we can
  // show the real `.convex.site` URL in the webhook prompt instead of a
  // `<your-project>` placeholder. Falls back gracefully if the var is missing.
  const localEnv = await readEnvFile()
  const siteUrl = localEnv.get('VITE_CONVEX_SITE_URL') ?? 'https://<your-project>.convex.site'

  if (skip) {
    nop('--no-resend passed, skipping prompts')
    if (!env.has('RESEND_API_KEY')) warnResendUnconfigured()
    return
  }

  const missing = [
    'RESEND_API_KEY',
    'EMAIL_FROM',
    'APP_NAME',
    'RESEND_WEBHOOK_SECRET',
  ].filter((k) => !env.has(k))
  if (missing.length === 0) {
    nop('RESEND_API_KEY, EMAIL_FROM, APP_NAME, RESEND_WEBHOOK_SECRET already set')
    return
  }

  // Non-TTY (CI, piped, scripted): can't prompt. Print actionable instructions
  // and a hard warning if the API key is missing.
  if (!process.stdin.isTTY) {
    yep('stdin is not a TTY, skipping Resend prompts')
    note(`missing: ${missing.join(', ')}`)
    note('set with: bunx convex env set NAME VALUE')
    if (!env.has('RESEND_API_KEY')) warnResendUnconfigured()
    return
  }

  note('Resend delivers the OTPs for sign-up, sign-in, password reset, and email change')
  note('grab an API key at https://resend.com/api-keys (starts with re_)')
  note('press Enter to accept defaults — except RESEND_API_KEY, which is required')
  line()

  const defaultAppName = await deriveAppName()

  // RESEND_API_KEY is required. Loop until the user pastes a value, or until
  // they explicitly confirm they want to skip and accept broken auth.
  if (!env.has('RESEND_API_KEY')) {
    yep('API key will be echoed as you paste it')
    let setOrSkipped = false
    while (!setOrSkipped) {
      const key = await ask(`  RESEND_API_KEY ${DIM}(required) >${RESET} `)
      if (key) {
        if (!key.startsWith('re_')) yep('does not look like a Resend key, setting anyway')
        await convexEnvSet('RESEND_API_KEY', key)
        ok('set RESEND_API_KEY')
        setOrSkipped = true
        break
      }
      // Empty input. Confirm before letting them ship a broken app.
      bad('RESEND_API_KEY is required for sign-up, sign-in, password reset, and change-email')
      if (await askYesNo('Skip anyway? Auth flows will be broken until you set it.', false)) {
        warnResendUnconfigured()
        setOrSkipped = true
        break
      }
      // Otherwise loop and re-prompt.
    }
  }

  // Track the final EMAIL_FROM value so we can make a smart RESEND_TEST_MODE
  // decision at the end of this step. We need this regardless of whether the
  // user overrode the default or skipped the prompt because it was already set.
  let emailFrom = env.get('EMAIL_FROM') ?? ''
  if (!env.has('EMAIL_FROM')) {
    const def = `${defaultAppName} <onboarding@resend.dev>`
    emailFrom = (await ask(`  EMAIL_FROM ${DIM}(${def}) >${RESET} `)) || def
    await convexEnvSet('EMAIL_FROM', emailFrom)
    ok(`set EMAIL_FROM=${emailFrom}`)
  }

  if (!env.has('APP_NAME')) {
    const name =
      (await ask(`  APP_NAME ${DIM}(${defaultAppName}) >${RESET} `)) || defaultAppName
    await convexEnvSet('APP_NAME', name)
    ok(`set APP_NAME=${name}`)
  }

  if (!env.has('RESEND_WEBHOOK_SECRET')) {
    // Resend generates this when you create a webhook; we can't auto-generate
    // it because Resend needs to know the value in order to sign events.
    note('Create a webhook at https://resend.com/webhooks pointing at')
    note(`  ${BOLD}${siteUrl}/resend-webhook${RESET}`)
    note('Resend shows the signing secret once when you save it.')
    note('Paste it here, or skip and set later.')
    const secret = await ask(
      `  RESEND_WEBHOOK_SECRET ${DIM}(paste, or Enter to skip) >${RESET} `,
    )
    if (!secret) {
      nop('skipped RESEND_WEBHOOK_SECRET (set later once you create the webhook)')
    } else {
      await convexEnvSet('RESEND_WEBHOOK_SECRET', secret)
      ok('set RESEND_WEBHOOK_SECRET')
    }
  }

  // Configure RESEND_TEST_MODE. The Convex Resend component defaults to test
  // mode true (drops any mail not going to @resend.dev), which makes a fresh
  // setup silently broken: sign-up succeeds, no OTP arrives, no log, nothing.
  // We want the starter to work out of the box, so we explicitly set it to
  // false here. The onboarding@resend.dev sender delivers to real addresses
  // without any domain verification, so this is safe when the user accepted
  // the default EMAIL_FROM. When they pasted a custom domain, we still set it
  // to false (because test mode would keep the project broken) but warn them
  // loudly to verify the domain.
  if (!env.has('RESEND_TEST_MODE')) {
    await convexEnvSet('RESEND_TEST_MODE', 'false')
    ok('set RESEND_TEST_MODE=false (emails go to real addresses)')
    const usesSandbox = /@resend\.dev>?$/.test(emailFrom.trim())
    if (!usesSandbox) {
      line()
      yep(`EMAIL_FROM uses a custom domain (${emailFrom})`)
      note('sign-up emails will FAIL until you verify this domain in Resend:')
      note('  https://resend.com/domains')
      note('until then, either verify the domain OR temporarily switch the')
      note('sender to onboarding@resend.dev:')
      note(`  bunx convex env set EMAIL_FROM "${defaultAppName} <onboarding@resend.dev>"`)
    }
  }
}

async function printSummary(useLocal: boolean, elapsedMs: number): Promise<void> {
  section('Summary')
  const [localEnv, convexEnv] = await Promise.all([readEnvFile(), convexEnvMap()])

  const localKeys = ['CONVEX_DEPLOYMENT', 'VITE_CONVEX_URL', 'VITE_CONVEX_SITE_URL']
  const convexKeys = [
    'SITE_URL',
    'BETTER_AUTH_SECRET',
    'RESEND_API_KEY',
    'EMAIL_FROM',
    'APP_NAME',
    'RESEND_TEST_MODE',
    'RESEND_WEBHOOK_SECRET',
  ]
  // Unified column width so the two blocks align vertically.
  const width = Math.max(
    ...localKeys.map((k) => k.length),
    ...convexKeys.map((k) => k.length),
  )
  const mark = (set: boolean) =>
    set ? `${GREEN}set${RESET}` : `${DIM}unset${RESET}`
  const row = (key: string, set: boolean) =>
    line(`    ${key.padEnd(width)}  ${mark(set)}`)

  line(`  ${BOLD}.env.local${RESET}`)
  for (const k of localKeys) row(k, localEnv.has(k))

  line(`\n  ${BOLD}Convex deployment env${RESET}`)
  for (const k of convexKeys) row(k, convexEnv.has(k))

  line(`\n  ${GREEN}ok${RESET}   setup complete in ${(elapsedMs / 1000).toFixed(2)}s`)
  line(`\n  next: ${BOLD}${useLocal ? 'bunx convex dev --local' : 'bun run dev'}${RESET}\n`)
}

// ─── Entry ───────────────────────────────────────────────────────────────────
// Guarded by import.meta.main so the file can be imported for its types
// without side effects (useful if a future test suite wants to exercise the
// step functions in isolation).

if (import.meta.main) {
  const startedAt = performance.now()
  try {
    await stepCleanup(!!args.fresh)
    activeConvexDev = await stepConvexDev(!!args.local, !!args.fresh)
    await stepLocalEnv()
    await stepAuthEnv(!!args.fresh)
    await stepResend(!!args['no-resend'], !!args.fresh)
    await printSummary(!!args.local, performance.now() - startedAt)
  } catch (err) {
    line()
    if (err instanceof $.ShellError) {
      bad(`shell command failed (exit ${err.exitCode})`)
      const tail = err.stderr?.toString().trim().split('\n').pop()?.trim()
      if (tail) note(tail)
    } else if (err instanceof Error) {
      bad(err.message)
    } else {
      bad(String(err))
    }
    process.exit(1)
  } finally {
    // Always stop the background `convex dev` process — success OR failure —
    // so the script doesn't leave a dangling dev server behind.
    if (activeConvexDev) {
      try {
        await activeConvexDev.stop()
      } catch {
        // Best-effort; the process may already be gone.
      }
      activeConvexDev = undefined
    }
  }
}
