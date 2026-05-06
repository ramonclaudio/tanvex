#!/usr/bin/env node
/**
 * Runtime-agnostic launcher for tanvex's TypeScript scripts.
 *
 * Picks the first available runtime that handles full TypeScript syntax:
 *
 *   1. bun — native TS, fastest startup
 *   2. tsx (devDep) — esbuild-based TS runner, works under any Node 18+
 *   3. npx tsx — final fallback
 *
 * We don't use node's `--experimental-strip-types` because it's strip-only
 * and rejects parameter properties, enums, namespaces, etc.
 *
 * Usage (from package.json scripts):
 *   node scripts/_run.mjs scripts/clean.ts [args...]
 */

import { spawn, spawnSync } from "node:child_process"
import { existsSync } from "node:fs"
import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"

const HERE = dirname(fileURLToPath(import.meta.url))
const REPO = resolve(HERE, "..")

const [, , target, ...rawRest] = process.argv
if (!target) {
  console.error("usage: _run.mjs <script.ts> [args...]")
  process.exit(2)
}

// pnpm passes a literal `--` separator before forwarded args. npm and yarn
// strip it. Drop a leading `--` so all PMs behave the same.
const rest = rawRest[0] === "--" ? rawRest.slice(1) : rawRest

function which(bin) {
  const r = spawnSync(process.platform === "win32" ? "where" : "which", [bin], {
    stdio: ["ignore", "pipe", "ignore"],
    encoding: "utf8",
  })
  if (r.status !== 0) return null
  return r.stdout.trim().split("\n")[0] || null
}

function pickRuntime() {
  // Already running under bun? Use it directly.
  if (process.versions.bun) return { cmd: process.execPath, args: [target] }

  // bun on PATH
  const bun = which("bun")
  if (bun) return { cmd: bun, args: [target] }

  // tsx devDep
  const tsx = resolve(REPO, "node_modules", ".bin", "tsx")
  if (existsSync(tsx)) return { cmd: tsx, args: [target] }

  // npx tsx final fallback
  const npx = which("npx")
  if (npx) return { cmd: npx, args: ["tsx", target] }

  console.error("tanvex scripts need bun or tsx to run TypeScript.")
  console.error("  install bun:  curl -fsSL https://bun.sh/install | bash")
  console.error("  or run:       npm install   (tanvex ships tsx as a devDep)")
  process.exit(1)
  return null
}

const runtime = pickRuntime()
const child = spawn(runtime.cmd, [...runtime.args, ...rest], {
  stdio: "inherit",
  cwd: REPO,
})
child.on("exit", (code, signal) => {
  process.exit(code ?? (signal ? 1 : 0))
})
