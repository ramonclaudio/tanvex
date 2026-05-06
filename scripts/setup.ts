/**
 * tanvex bootstrapper.
 *
 * Resets the project to a clean state and walks through Convex + Better
 * Auth + Resend setup. Wipes node_modules, lockfile, build artifacts, and
 * generated files, then reinstalls deps and configures environment.
 *
 * Use for fresh installs or to reset a broken project. Convex deployment
 * env vars survive a re-run (not rotated), but for one-off changes use
 * `<dlx> convex env set NAME VALUE` directly instead of re-running setup.
 *
 * Runtime-agnostic: works under bun, node, tsx. The `_run.mjs` launcher
 * picks the runtime; this script uses only node: built-ins plus the web
 * crypto and TextDecoder globals (universal in Node 18+ and Bun).
 *
 * All progress output goes to stderr so the script composes cleanly in pipes.
 *
 * Exit codes:
 *   0   success
 *   1   runtime error (shell, writes, missing state)
 *   2   invalid CLI flag
 *   130 SIGINT (Ctrl+C)
 *   143 SIGTERM
 */

import { spawn as nodeSpawn } from "node:child_process"
import { access, readFile, rm, writeFile } from "node:fs/promises"
import { dirname, resolve as resolvePath } from "node:path"
import { createInterface } from "node:readline/promises"
import { setTimeout as sleep } from "node:timers/promises"
import { fileURLToPath } from "node:url"
import { parseArgs } from "node:util"

// ─── Paths ───────────────────────────────────────────────────────────────────
// Anchor to the repo root so the script works when invoked from any cwd.

const REPO_ROOT = resolvePath(dirname(fileURLToPath(import.meta.url)), "..")
process.chdir(REPO_ROOT)

// ─── Output: everything goes to stderr ───────────────────────────────────────
// A setup script has no primary output, all of this is progress. Writing to
// stderr lets users hide it with `2>/dev/null` while still seeing the
// interactive command's stdout.

const NO_COLOR = !!process.env.NO_COLOR
const FORCE_COLOR = !!process.env.FORCE_COLOR
const useColor = FORCE_COLOR || (!NO_COLOR && (process.stderr.isTTY ?? false))

function ansiHex(hex: string): string {
  if (!useColor) return ""
  const m = /^#?([\da-f]{2})([\da-f]{2})([\da-f]{2})$/i.exec(hex)
  if (!m) return ""
  return `\x1b[38;2;${parseInt(m[1], 16)};${parseInt(m[2], 16)};${parseInt(m[3], 16)}m`
}

const RESET = useColor ? "\x1b[0m" : ""
const BOLD = useColor ? "\x1b[1m" : ""
const DIM = useColor ? "\x1b[2m" : ""
const GREEN = ansiHex("#22c55e")
const RED = ansiHex("#ef4444")
const YELLOW = ansiHex("#f59e0b")
const VIOLET = ansiHex("#a78bfa")

const write = (s: string): void => {
  process.stderr.write(s)
}
const line = (s = ""): void => {
  process.stderr.write(s + "\n")
}

const ok = (msg: string): void => line(`  ${GREEN}ok${RESET}   ${msg}`)
const nop = (msg: string): void => line(`  ${DIM}--   ${msg}${RESET}`)
const yep = (msg: string): void => line(`  ${YELLOW}!!${RESET}   ${msg}`)
const bad = (msg: string): void => line(`  ${RED}xx${RESET}   ${RED}${msg}${RESET}`)
const note = (msg: string): void => line(`       ${DIM}${msg}${RESET}`)

function section(title: string): void {
  const w = process.stderr.columns ?? process.stdout.columns ?? 80
  // ASCII-only title, code units are equivalent to display width
  const fill = "─".repeat(Math.max(0, w - title.length - 3))
  line(`\n${BOLD}${VIOLET}${title}${RESET} ${DIM}${fill}${RESET}`)
}

// ─── Interactive prompt ──────────────────────────────────────────────────────
// Question goes to stderr (preserves the "all progress to stderr" rule). We
// build a fresh readline interface per call so closing it cleanly releases
// stdin for the next prompt or for inherited child processes.

async function ask(question: string): Promise<string> {
  write(question)
  const rl = createInterface({
    input: process.stdin,
    output: process.stderr,
    terminal: false,
  })
  try {
    const answer = await new Promise<string>((resolve) => {
      rl.once("line", (raw: string) => resolve(raw))
      rl.once("close", () => resolve(""))
    })
    return answer.trim()
  } finally {
    rl.close()
  }
}

async function askYesNo(question: string, defaultYes: boolean): Promise<boolean> {
  const hint = defaultYes ? "Y/n" : "y/N"
  const raw = (await ask(`  ${question} ${DIM}[${hint}] >${RESET} `)).toLowerCase()
  if (!raw) return defaultYes
  return raw === "y" || raw === "yes"
}

// ─── Subprocess helpers ──────────────────────────────────────────────────────

function spawnInherit(argv: ReadonlyArray<string>): Promise<number> {
  return new Promise((resolve) => {
    const proc = nodeSpawn(argv[0], argv.slice(1), { stdio: "inherit", cwd: REPO_ROOT })
    let settled = false
    const finish = (code: number) => {
      if (settled) return
      settled = true
      resolve(code)
    }
    proc.once("exit", (code, signal) => finish(code ?? (signal ? 1 : 0)))
    proc.once("error", () => finish(1))
  })
}

type CaptureOpts = { timeout?: number }

function spawnCapture(
  argv: ReadonlyArray<string>,
  opts: CaptureOpts = {},
): Promise<{ code: number; stdout: string; stderr: string }> {
  return new Promise((resolve) => {
    const proc = nodeSpawn(argv[0], argv.slice(1), {
      stdio: ["ignore", "pipe", "pipe"],
      cwd: REPO_ROOT,
    })
    let stdout = ""
    let stderr = ""
    proc.stdout?.on("data", (c) => (stdout += String(c)))
    proc.stderr?.on("data", (c) => (stderr += String(c)))
    let timer: ReturnType<typeof setTimeout> | undefined
    if (opts.timeout) {
      timer = setTimeout(() => proc.kill(), opts.timeout)
    }
    let settled = false
    const finish = (code: number) => {
      if (settled) return
      settled = true
      if (timer) clearTimeout(timer)
      // oxlint-disable-next-line promise/no-multiple-resolved
      resolve({ code, stdout, stderr })
    }
    proc.once("exit", (code, signal) => finish(code ?? (signal ? 1 : 0)))
    proc.once("error", () => finish(1))
  })
}

// ─── Runtime + package manager detection ─────────────────────────────────────

type PackageManager = "bun" | "pnpm" | "yarn" | "npm"

async function fileExists(p: string): Promise<boolean> {
  try {
    await access(p)
    return true
  } catch {
    return false
  }
}

async function detectPackageManager(): Promise<PackageManager> {
  // npm_config_user_agent is set by every modern PM and starts with the PM
  // name (e.g. "bun/1.3.13 npm/? node/v24.12.0"). startsWith is robust against
  // path-substring false positives, e.g. pnpm's binary path containing "npm".
  const ua = (process.env.npm_config_user_agent ?? "").toLowerCase()
  if (ua.startsWith("bun")) return "bun"
  if (ua.startsWith("pnpm")) return "pnpm"
  if (ua.startsWith("yarn")) return "yarn"
  if (ua.startsWith("npm")) return "npm"
  if (await fileExists("bun.lock")) return "bun"
  if (await fileExists("bun.lockb")) return "bun"
  if (await fileExists("pnpm-lock.yaml")) return "pnpm"
  if (await fileExists("yarn.lock")) return "yarn"
  return "npm"
}

function installArgv(pm: PackageManager): Array<string> {
  return [pm, "install"]
}

const RUN_CMD: Record<PackageManager, string> = {
  bun: "bun run",
  pnpm: "pnpm",
  yarn: "yarn",
  npm: "npm run",
}

const DLX_CMD: Record<PackageManager, string> = {
  bun: "bunx",
  pnpm: "pnpm dlx",
  yarn: "yarn dlx",
  npm: "npx",
}

/** Runtime-aware dlx for our subprocess invocations. */
function dlx(): string {
  return process.versions.bun ? "bunx" : "npx"
}

// ─── Args ────────────────────────────────────────────────────────────────────

const HELP = `${BOLD}tanvex setup${RESET}

${BOLD}Usage:${RESET}
  ${DIM}<pm> run setup${RESET}              cloud Convex (interactive)
  ${DIM}<pm> run setup --local${RESET}      self-hosted / local Convex backend
  ${DIM}<pm> run setup --fresh${RESET}      provision a NEW Convex deployment
                              (wipes ${DIM}.env.local${RESET}; use after schema
                              refactors that reject old rows)
  ${DIM}<pm> run setup --version${RESET}    print runtime version and exit
  ${DIM}<pm> run setup --help${RESET}       this message

Wipes node_modules, lockfile, build artifacts, and generated files, then
reinstalls deps and walks through Convex + Better Auth + Resend setup.
Use this for fresh installs or to reset a broken project.

By default, ${DIM}CONVEX_DEPLOYMENT${RESET} in ${DIM}.env.local${RESET} survives a re-run and setup
reconnects to the same backend. Pass ${DIM}--fresh${RESET} to create a new Convex
project instead. Stale data, deployment env vars, and webhook configs on
the old deployment are all left behind. For one-off env var changes on a
working project, use ${DIM}<dlx> convex env set NAME VALUE${RESET} directly instead of
re-running setup.

${BOLD}Note:${RESET} Resend is required by this codebase. Sign-up, sign-in,
verification, password reset, and email change all need email delivery.
`

let argLocal = false
let argFresh = false
try {
  const { values } = parseArgs({
    args: process.argv.slice(2),
    options: {
      local: { type: "boolean", default: false },
      fresh: { type: "boolean", default: false },
      version: { type: "boolean", short: "v", default: false },
      help: { type: "boolean", short: "h", default: false },
    },
    strict: true,
  })
  if (values.help) {
    line(HELP)
    process.exit(0)
  }
  if (values.version) {
    const runtime = process.versions.bun
      ? `bun ${process.versions.bun}`
      : `node ${process.versions.node}`
    line(runtime)
    process.exit(0)
  }
  argLocal = values.local ?? false
  argFresh = values.fresh ?? false
} catch (err) {
  bad(err instanceof Error ? err.message : String(err))
  note("try: <pm> run setup --help")
  process.exit(2)
}

// ─── Signals ─────────────────────────────────────────────────────────────────
// Handle SIGINT and SIGTERM so the script never leaves a half-ANSI-colored
// terminal or a leaked `convex dev` child.

type ConvexDevHandle = {
  stop: () => Promise<void>
}

let activeConvexDev: ConvexDevHandle | undefined

const shutdown = (code: number, label: string, hint: string): void => {
  line(`\n${YELLOW}${label}${RESET} ${DIM}${hint}${RESET}`)
  activeConvexDev?.stop().catch(() => {})
  process.exit(code)
}

process.on("SIGINT", () => shutdown(130, "interrupted", "(Ctrl+C)"))
process.on("SIGTERM", () => shutdown(143, "terminated", "(SIGTERM)"))

// ─── Env file I/O ────────────────────────────────────────────────────────────

const ENV_FILE = ".env.local"

/**
 * Parse `.env.local` into a Map. Handles inline comments (` # ...` after the
 * value) and surrounding whitespace, critical because Convex writes lines
 * like `CONVEX_DEPLOYMENT=dev:foo # team: bar, project: baz`.
 */
async function readEnvFile(): Promise<Map<string, string>> {
  const out = new Map<string, string>()
  if (!(await fileExists(ENV_FILE))) return out
  const text = await readFile(ENV_FILE, "utf8")
  for (const raw of text.split("\n")) {
    const trimmed = raw.trim()
    if (!trimmed || trimmed.startsWith("#")) continue
    const eq = trimmed.indexOf("=")
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
 * lines, unlike a rewrite-from-Map approach.
 */
async function ensureEnvLocalLine(key: string, value: string): Promise<void> {
  const exists = await fileExists(ENV_FILE)
  const current = exists ? await readFile(ENV_FILE, "utf8") : ""
  // Match `KEY=` only at the start of a line so commented-out `# KEY=...` is ignored.
  if (new RegExp(`^${key}=`, "m").test(current)) return
  const needsNewline = current !== "" && !current.endsWith("\n")
  await writeFile(ENV_FILE, `${current}${needsNewline ? "\n" : ""}${key}=${value}\n`)
}

// ─── Convex helpers ──────────────────────────────────────────────────────────

async function convexEnvMap(): Promise<Map<string, string>> {
  const deployment = deploymentNameFromEnvValue(process.env.CONVEX_DEPLOYMENT)
  const argv = [dlx(), "convex", "env", "list"]
  if (deployment) argv.push("--deployment", deployment)
  const { code, stdout } = await spawnCapture(argv)
  const out = new Map<string, string>()
  if (code !== 0) return out
  for (const raw of stdout.split("\n")) {
    const trimmed = raw.trim()
    if (!trimmed) continue
    const eq = trimmed.indexOf("=")
    if (eq > 0) out.set(trimmed.slice(0, eq), trimmed.slice(eq + 1))
  }
  return out
}

/**
 * Strip the `dev:` / `prod:` prefix from a CONVEX_DEPLOYMENT value to get the
 * bare deployment name. The env-var form requires the prefix; the CLI's
 * `--deployment` flag rejects it and expects just `name`.
 */
function deploymentNameFromEnvValue(value: string | undefined): string | undefined {
  if (!value) return undefined
  const m = /^(?:dev|prod|preview):(.+)$/.exec(value)
  return m ? m[1] : value
}

/**
 * Run `<dlx> convex env set NAME VALUE` with explicit `--deployment <name>`.
 * stdin is closed so the CLI can't hang on an interactive retry; stderr is
 * captured for error reporting; a hard timeout kills the process if it gets
 * stuck on flaky network state.
 */
async function runConvexEnvSetOnce(
  name: string,
  value: string,
): Promise<{ exitCode: number; stderr: string }> {
  const deployment = deploymentNameFromEnvValue(process.env.CONVEX_DEPLOYMENT)
  const argv = [dlx(), "convex", "env", "set"]
  if (deployment) argv.push("--deployment", deployment)
  argv.push(name, value)
  const { code, stderr } = await spawnCapture(argv, { timeout: 15_000 })
  return { exitCode: code, stderr }
}

async function convexEnvSet(name: string, value: string): Promise<void> {
  const res = await runConvexEnvSetOnce(name, value)
  if (res.exitCode === 0) return
  const tail = res.stderr.trim().split("\n").pop()?.trim() ?? `exit ${res.exitCode}`
  throw new Error(`convex env set ${name} failed: ${tail}`)
}

// ─── Crypto: 32 random bytes, base64, web-standard ───────────────────────────

function base64Secret(): string {
  const buf = new Uint8Array(32)
  crypto.getRandomValues(buf)
  return btoa(String.fromCharCode(...buf))
}

// ─── Defaults derived from package.json ──────────────────────────────────────

async function deriveAppName(): Promise<string> {
  try {
    const pkg: unknown = JSON.parse(await readFile("package.json", "utf8"))
    if (typeof pkg !== "object" || pkg === null || !("name" in pkg)) return "App"
    const { name } = pkg
    if (typeof name !== "string" || !name) return "App"
    const clean = name.replace(/^@[^/]+\//, "")
    const parts = clean.split(/[-_]/).filter(Boolean)
    if (parts.length === 0) return "App"
    return parts.map((w) => (w[0] ?? "").toUpperCase() + w.slice(1)).join(" ")
  } catch {
    return "App"
  }
}

// ─── Steps ───────────────────────────────────────────────────────────────────

/**
 * Wipe local state and reinstall dependencies. `.env.local` is NOT touched
 * by default, so `CONVEX_DEPLOYMENT` survives and the next `convex dev`
 * reconnects to the same backend.
 *
 * When `fresh` is true, `.env.local` is also wiped so the subsequent
 * `convex dev --configure new` writes a clean set of Convex values instead
 * of inheriting the old deployment's `VITE_CONVEX_SITE_URL`.
 */
async function stepCleanup(fresh: boolean, pm: PackageManager): Promise<void> {
  section("Clean install")
  const targets = [
    "node_modules",
    "bun.lock",
    "bun.lockb",
    "pnpm-lock.yaml",
    "yarn.lock",
    "package-lock.json",
    "dist",
    ".output",
    ".nitro",
    ".tanstack",
    ".vite",
    ".cache",
    "convex/_generated",
    "src/routeTree.gen.ts",
    "tsconfig.tsbuildinfo",
    ...(fresh ? [ENV_FILE] : []),
  ]
  await Promise.all(targets.map((t) => rm(t, { recursive: true, force: true })))
  ok(
    fresh
      ? `wiped node_modules, lockfiles, build artifacts, and ${ENV_FILE}`
      : "wiped node_modules, lockfiles, and build artifacts",
  )

  const argv = installArgv(pm)
  const code = await spawnInherit(argv)
  if (code !== 0) throw new Error(`${argv.join(" ")} exited with code ${code}`)
  ok(argv.join(" "))
}

/**
 * Spawn `convex dev` (without --once) and wait for the initial push to
 * finish. The dev process stays alive while we run `convex env set` calls,
 * which is what the Convex CLI expects: `--once` exits before the backend
 * fully registers the deployment for write-endpoint auth.
 */
async function stepConvexDev(useLocal: boolean, fresh: boolean): Promise<ConvexDevHandle> {
  section("Convex deployment")
  const cmd = [dlx(), "convex", "dev"]
  if (useLocal) cmd.push("--local")
  if (fresh) cmd.push("--configure", "new")
  cmd.push("--tail-logs", "disable")

  // stdin inherited so configure prompts work; stdout/stderr piped so we can
  // watch for the "ready" marker while still streaming output to the user.
  const proc = nodeSpawn(cmd[0], cmd.slice(1), {
    stdio: ["inherit", "pipe", "pipe"],
    cwd: REPO_ROOT,
  })

  const readyMarker = /Convex functions ready!/
  let signalReady: (() => void) | undefined
  const readyPromise = new Promise<void>((resolve) => {
    signalReady = resolve
  })

  const forward = (stream: typeof proc.stdout): void => {
    if (!stream) return
    stream.on("data", (chunk) => {
      const text = String(chunk)
      process.stderr.write(text)
      if (readyMarker.test(text)) signalReady?.()
    })
  }
  forward(proc.stdout)
  forward(proc.stderr)

  let exited = false
  const exitPromise = new Promise<number>((resolve) => {
    proc.once("exit", (code, signal) => {
      exited = true
      resolve(code ?? (signal ? 1 : 0))
    })
    proc.once("error", () => {
      exited = true
      resolve(1)
    })
  })

  // Race readiness against process exit and a 180s ceiling. On first-run with
  // component installs, the initial push can take 30-60s.
  type Outcome = { kind: "ready" } | { kind: "exit"; code: number } | { kind: "timeout" }
  let timeoutHandle: ReturnType<typeof setTimeout> | undefined
  const timeoutOutcome = new Promise<Outcome>((resolve) => {
    timeoutHandle = setTimeout(() => resolve({ kind: "timeout" }), 180_000)
  })

  try {
    const outcome = await Promise.race<Outcome>([
      readyPromise.then(() => ({ kind: "ready" }) as const),
      exitPromise.then((code) => ({ kind: "exit", code }) as const),
      timeoutOutcome,
    ])
    if (outcome.kind === "exit") {
      throw new Error(`convex dev exited before becoming ready (code ${outcome.code})`)
    }
    if (outcome.kind === "timeout") {
      proc.kill()
      throw new Error("convex dev did not become ready within 180s")
    }
  } finally {
    if (timeoutHandle) clearTimeout(timeoutHandle)
  }

  // Give Convex a moment to fully settle the just-pushed schema before we
  // start hammering the env write endpoint.
  await sleep(500)

  // Refresh process.env from the (now up-to-date) .env.local so child processes
  // inherit the NEW deployment.
  const freshEnv = await readEnvFile()
  for (const key of ["CONVEX_DEPLOYMENT", "VITE_CONVEX_URL", "VITE_CONVEX_SITE_URL"]) {
    const value = freshEnv.get(key)
    if (value) process.env[key] = value
    else delete process.env[key]
  }
  note(`targeting deployment: ${process.env.CONVEX_DEPLOYMENT}`)

  return {
    stop: async () => {
      if (exited) return
      proc.kill("SIGTERM")
      const raced = await Promise.race([exitPromise, sleep(2_000).then(() => "timeout" as const)])
      if (raced === "timeout") proc.kill("SIGKILL")
      await exitPromise
    },
  }
}

async function stepLocalEnv(): Promise<void> {
  section(".env.local")
  const env = await readEnvFile()
  const deployment = env.get("CONVEX_DEPLOYMENT")
  if (!deployment) throw new Error(`CONVEX_DEPLOYMENT missing from ${ENV_FILE}`)
  const projectName = deployment.split("#")[0].trim().split(":")[1]
  if (!projectName) throw new Error(`invalid CONVEX_DEPLOYMENT: ${deployment}`)
  ok(`connected to ${BOLD}${projectName}${RESET}`)

  if (env.has("VITE_CONVEX_SITE_URL")) {
    nop("VITE_CONVEX_SITE_URL already set")
    return
  }
  await ensureEnvLocalLine("VITE_CONVEX_SITE_URL", `https://${projectName}.convex.site`)
  ok(`wrote VITE_CONVEX_SITE_URL to ${ENV_FILE}`)
}

async function stepAuthEnv(fresh: boolean): Promise<void> {
  section("Better Auth")
  const env = fresh ? new Map<string, string>() : await convexEnvMap()

  if (env.has("SITE_URL")) {
    nop("SITE_URL already set")
  } else {
    const defaultUrl = "http://localhost:3000"
    const siteUrl = process.stdin.isTTY
      ? (await ask(`  SITE_URL ${DIM}(${defaultUrl}) >${RESET} `)) || defaultUrl
      : defaultUrl
    await convexEnvSet("SITE_URL", siteUrl)
    ok(`set SITE_URL=${siteUrl}`)
  }

  if (env.has("BETTER_AUTH_SECRET")) {
    nop("BETTER_AUTH_SECRET already set (rotating would invalidate sessions)")
  } else {
    const pasted = process.stdin.isTTY
      ? await ask(`  BETTER_AUTH_SECRET ${DIM}(Enter to auto-generate) >${RESET} `)
      : ""
    const autoGen = !pasted
    await convexEnvSet("BETTER_AUTH_SECRET", autoGen ? base64Secret() : pasted)
    ok(autoGen ? "generated BETTER_AUTH_SECRET" : "set BETTER_AUTH_SECRET from paste")
  }
}

function warnResendUnconfigured(): void {
  bad("RESEND_API_KEY is unset, auth flows will fail at runtime")
  note("sign-up, sign-in, password reset, and change-email all send OTPs")
  note(`set later with: ${dlx()} convex env set RESEND_API_KEY re_...`)
}

async function stepResend(fresh: boolean): Promise<void> {
  section("Resend (email delivery, required)")

  const env = fresh ? new Map<string, string>() : await convexEnvMap()
  const localEnv = await readEnvFile()
  const siteUrl = localEnv.get("VITE_CONVEX_SITE_URL") ?? "https://<your-project>.convex.site"

  const missing = ["RESEND_API_KEY", "EMAIL_FROM", "APP_NAME", "RESEND_WEBHOOK_SECRET"].filter(
    (k) => !env.has(k),
  )
  if (missing.length === 0) {
    nop("RESEND_API_KEY, EMAIL_FROM, APP_NAME, RESEND_WEBHOOK_SECRET already set")
    return
  }

  if (!process.stdin.isTTY) {
    yep("stdin is not a TTY, skipping Resend prompts")
    note(`missing: ${missing.join(", ")}`)
    note(`set with: ${dlx()} convex env set NAME VALUE`)
    if (!env.has("RESEND_API_KEY")) warnResendUnconfigured()
    return
  }

  note("Resend delivers the OTPs for sign-up, sign-in, password reset, and email change")
  note("grab an API key at https://resend.com/api-keys (starts with re_)")
  note("press Enter to accept defaults, except RESEND_API_KEY which is required")
  line()

  const defaultAppName = await deriveAppName()

  if (!env.has("RESEND_API_KEY")) {
    yep("API key will be echoed as you paste it")
    let setOrSkipped = false
    while (!setOrSkipped) {
      const key = await ask(`  RESEND_API_KEY ${DIM}(required) >${RESET} `)
      if (key) {
        if (!key.startsWith("re_")) yep("does not look like a Resend key, setting anyway")
        await convexEnvSet("RESEND_API_KEY", key)
        ok("set RESEND_API_KEY")
        setOrSkipped = true
        break
      }
      bad("RESEND_API_KEY is required for sign-up, sign-in, password reset, and change-email")
      if (await askYesNo("Skip anyway? Auth flows will be broken until you set it.", false)) {
        warnResendUnconfigured()
        setOrSkipped = true
        break
      }
    }
  }

  let emailFrom = env.get("EMAIL_FROM") ?? ""
  if (!env.has("EMAIL_FROM")) {
    const def = `${defaultAppName} <onboarding@resend.dev>`
    emailFrom = (await ask(`  EMAIL_FROM ${DIM}(${def}) >${RESET} `)) || def
    await convexEnvSet("EMAIL_FROM", emailFrom)
    ok(`set EMAIL_FROM=${emailFrom}`)
  }

  if (!env.has("APP_NAME")) {
    const name = (await ask(`  APP_NAME ${DIM}(${defaultAppName}) >${RESET} `)) || defaultAppName
    await convexEnvSet("APP_NAME", name)
    ok(`set APP_NAME=${name}`)
  }

  if (!env.has("RESEND_WEBHOOK_SECRET")) {
    note("Create a webhook at https://resend.com/webhooks pointing at")
    note(`  ${BOLD}${siteUrl}/resend-webhook${RESET}`)
    note("Resend shows the signing secret once when you save it.")
    note("Paste it here, or skip and set later.")
    const secret = await ask(`  RESEND_WEBHOOK_SECRET ${DIM}(paste, or Enter to skip) >${RESET} `)
    if (!secret) {
      nop("skipped RESEND_WEBHOOK_SECRET (set later once you create the webhook)")
    } else {
      await convexEnvSet("RESEND_WEBHOOK_SECRET", secret)
      ok("set RESEND_WEBHOOK_SECRET")
    }
  }

  // Configure RESEND_TEST_MODE. The Convex Resend component defaults to test
  // mode true (drops any mail not going to @resend.dev), which makes a fresh
  // setup silently broken. We explicitly set it to false here so the starter
  // works out of the box.
  if (!env.has("RESEND_TEST_MODE")) {
    await convexEnvSet("RESEND_TEST_MODE", "false")
    ok("set RESEND_TEST_MODE=false (emails go to real addresses)")
    const usesSandbox = /@resend\.dev>?$/.test(emailFrom.trim())
    if (!usesSandbox) {
      line()
      yep(`EMAIL_FROM uses a custom domain (${emailFrom})`)
      note("sign-up emails will FAIL until you verify this domain in Resend:")
      note("  https://resend.com/domains")
      note("until then, either verify the domain OR temporarily switch the")
      note("sender to onboarding@resend.dev:")
      note(`  ${dlx()} convex env set EMAIL_FROM "${defaultAppName} <onboarding@resend.dev>"`)
    }
  }
}

async function printSummary(
  useLocal: boolean,
  pm: PackageManager,
  elapsedMs: number,
): Promise<void> {
  section("Summary")
  const [localEnv, convexEnv] = await Promise.all([readEnvFile(), convexEnvMap()])

  const localKeys = ["CONVEX_DEPLOYMENT", "VITE_CONVEX_URL", "VITE_CONVEX_SITE_URL"]
  const convexKeys = [
    "SITE_URL",
    "BETTER_AUTH_SECRET",
    "RESEND_API_KEY",
    "EMAIL_FROM",
    "APP_NAME",
    "RESEND_TEST_MODE",
    "RESEND_WEBHOOK_SECRET",
  ]
  const width = Math.max(...localKeys.map((k) => k.length), ...convexKeys.map((k) => k.length))
  const mark = (set: boolean) => (set ? `${GREEN}set${RESET}` : `${DIM}unset${RESET}`)
  const row = (key: string, set: boolean) => line(`    ${key.padEnd(width)}  ${mark(set)}`)

  line(`  ${BOLD}.env.local${RESET}`)
  for (const k of localKeys) row(k, localEnv.has(k))

  line(`\n  ${BOLD}Convex deployment env${RESET}`)
  for (const k of convexKeys) row(k, convexEnv.has(k))

  line(`\n  ${GREEN}ok${RESET}   setup complete in ${(elapsedMs / 1000).toFixed(2)}s`)
  const next = useLocal ? `${DLX_CMD[pm]} convex dev --local` : `${RUN_CMD[pm]} dev`
  line(`\n  next: ${BOLD}${next}${RESET}\n`)
}

// ─── Entry ───────────────────────────────────────────────────────────────────

const startedAt = performance.now()
try {
  const pm = await detectPackageManager()
  await stepCleanup(argFresh, pm)
  activeConvexDev = await stepConvexDev(argLocal, argFresh)
  await stepLocalEnv()
  await stepAuthEnv(argFresh)
  await stepResend(argFresh)
  await printSummary(argLocal, pm, performance.now() - startedAt)
} catch (err) {
  line()
  bad(err instanceof Error ? err.message : String(err))
  process.exit(1)
} finally {
  if (activeConvexDev) {
    try {
      await activeConvexDev.stop()
    } catch {
      // best-effort, the process may already be gone
    }
    activeConvexDev = undefined
  }
}
