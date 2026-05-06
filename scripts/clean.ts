/**
 * tanvex clean script.
 *
 * Wipes node_modules, lockfiles, build artifacts, generated Convex code.
 * Reinstalls deps via the detected package manager. Auto-fixes formatting
 * and lint, refreshes Convex codegen, then runs the verify chain so the
 * project lands in a known-good state.
 *
 * Order is fix-then-verify: oxfmt, convex codegen, oxlint --fix, vite build,
 * tsc --noEmit, vitest run. Convex codegen sits between fmt and lint because
 * oxlint runs type-aware rules that consult `convex/_generated/*`.
 *
 * Output is quiet by default: each step prints just `→ name` then `✓ time`.
 * On failure, the captured stdout/stderr of the failing step is dumped so
 * the user can see what broke. Pass `VERBOSE=1` to stream all child output.
 *
 * PM-agnostic: detects bun/pnpm/yarn/npm via `npm_config_user_agent` or lockfile.
 * Uses macOS `trash` so anything wiped is recoverable.
 *
 * Usage:
 *   <pm> run clean              # quiet (default)
 *   VERBOSE=1 <pm> run clean    # stream every tool's output
 */

import { spawn as nodeSpawn } from "node:child_process"
import { existsSync } from "node:fs"
import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"

type PM = "bun" | "pnpm" | "yarn" | "npm"

const VERBOSE = process.env.VERBOSE === "1" || process.env.VERBOSE === "true"

function detectPackageManager(): PM {
  // npm_config_user_agent starts with the PM name (e.g. "bun/1.3.13 ..."),
  // unlike npm_execpath substring checks which are order-dependent because
  // the pnpm binary path contains "npm".
  const ua = (process.env.npm_config_user_agent ?? "").toLowerCase()
  if (ua.startsWith("bun")) return "bun"
  if (ua.startsWith("pnpm")) return "pnpm"
  if (ua.startsWith("yarn")) return "yarn"
  if (ua.startsWith("npm")) return "npm"
  if (existsSync("bun.lock")) return "bun"
  if (existsSync("pnpm-lock.yaml")) return "pnpm"
  if (existsSync("yarn.lock")) return "yarn"
  return "npm"
}

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), "..")
process.chdir(REPO)

const PATHS = [
  "node_modules",
  "bun.lock",
  "pnpm-lock.yaml",
  "yarn.lock",
  "package-lock.json",
  ".nitro",
  ".output",
  ".tanstack",
  ".wrangler",
  ".vinxi",
  "dist",
  "dist-ssr",
  "coverage",
  "convex/_generated",
  "src/routeTree.gen.ts",
]

/**
 * Run a command silently. Returns exit code + captured stdout/stderr.
 * In VERBOSE mode, streams output to the parent stdio instead of capturing.
 */
function exec(
  argv: ReadonlyArray<string>,
): Promise<{ code: number; stdout: string; stderr: string }> {
  return new Promise((res) => {
    if (VERBOSE) {
      const proc = nodeSpawn(argv[0], argv.slice(1), { stdio: "inherit" })
      let settled = false
      const finishVerbose = (code: number) => {
        if (settled) return
        settled = true
        res({ code, stdout: "", stderr: "" })
      }
      proc.once("exit", (code, signal) => finishVerbose(code ?? (signal ? 1 : 0)))
      proc.once("error", () => finishVerbose(1))
      return
    }
    const proc = nodeSpawn(argv[0], argv.slice(1), {
      stdio: ["ignore", "pipe", "pipe"],
    })
    let stdout = ""
    let stderr = ""
    proc.stdout?.on("data", (c) => (stdout += String(c)))
    proc.stderr?.on("data", (c) => (stderr += String(c)))
    let settled = false
    const finish = (code: number) => {
      if (settled) return
      settled = true
      res({ code, stdout, stderr })
    }
    proc.once("exit", (code, signal) => finish(code ?? (signal ? 1 : 0)))
    proc.once("error", () => finish(1))
  })
}

async function step<T>(name: string, fn: () => Promise<T>): Promise<T> {
  const start = performance.now()
  process.stderr.write(`→ ${name}\n`)
  try {
    const result = await fn()
    process.stderr.write(`  ✓ ${((performance.now() - start) / 1000).toFixed(1)}s\n`)
    return result
  } catch (err) {
    process.stderr.write(`  ✗ ${((performance.now() - start) / 1000).toFixed(1)}s\n`)
    throw err
  }
}

async function trashIfExists(path: string): Promise<void> {
  if (!existsSync(path)) return
  const { code } = await exec(["trash", path])
  if (code !== 0) throw new Error(`trash ${path} exited ${code}`)
}

/**
 * Run a command. On non-zero exit, print the captured output (so the user
 * sees what failed) and throw. In VERBOSE mode there's nothing to dump
 * because output streamed live.
 */
async function run(cmd: ReadonlyArray<string>): Promise<void> {
  const { code, stdout, stderr } = await exec(cmd)
  if (code !== 0) {
    if (stdout.trim()) process.stderr.write(stdout)
    if (stderr.trim()) process.stderr.write(stderr)
    throw new Error(`${cmd.join(" ")} exited ${code}`)
  }
}

void (async () => {
  const pm = detectPackageManager()
  const startedAt = performance.now()

  try {
    await step("trash artifacts", async () => {
      for (const p of PATHS) await trashIfExists(p)
      await exec([
        "find",
        ".",
        "-name",
        ".DS_Store",
        "-not",
        "-path",
        "./node_modules/*",
        "-exec",
        "trash",
        "{}",
        "+",
      ])
    })

    await step(`${pm} install`, () => run([pm, "install"]))
    await step("oxfmt", () => run(["oxfmt"]))
    await step("convex ai-files update", () => run(["convex", "ai-files", "update"]))
    await step("convex dev --once", () => run(["convex", "dev", "--once"]))
    await step("oxlint --fix", () => run(["oxlint", "--fix"]))
    await step("vite build", () => run(["vite", "build", "--logLevel", "warn"]))
    await step("tsc --noEmit", () => run(["tsc", "--noEmit"]))
    await step("vitest run", () => run(["vitest", "run"]))

    process.stderr.write(`\n✓ ${((performance.now() - startedAt) / 1000).toFixed(1)}s total\n`)
  } catch (err) {
    process.stderr.write(`\n✗ ${err instanceof Error ? err.message : String(err)}\n`)
    process.exit(1)
  }
})()
