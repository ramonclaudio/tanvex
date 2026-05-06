#!/usr/bin/env node
/**
 * Apply patches/*.patch to node_modules. Runtime + PM agnostic.
 *
 * Why not patch-package? It requires a npm/yarn lockfile. We commit bun.lock
 * as our internal lockfile of record; users who pick another PM can still
 * apply patches without first generating a yarn.lock.
 *
 * Why not bun's `patchedDependencies`? Bun-only.
 *
 * Filename formats supported:
 *   <pkg>@<version>.patch                     (bun, URL-encoded scope)
 *   <pkg>+<version>.patch                     (patch-package, + separators)
 *   @scope%2F<pkg>@<version>.patch            (bun scoped)
 *   @scope+<pkg>+<version>.patch              (patch-package scoped)
 *
 * Idempotent: if a patch is already applied (reverse dry-run succeeds),
 * skip it. Safe to run twice.
 *
 * Uses the system `patch` utility (POSIX-standard, present on macOS, Linux,
 * and Git Bash on Windows).
 */

import { spawnSync } from "node:child_process"
import { existsSync } from "node:fs"
import { readdir } from "node:fs/promises"
import { resolve } from "node:path"

const PATCH_DIR = "patches"
const ROOT = process.cwd()

if (!existsSync(PATCH_DIR)) process.exit(0)

const files = (await readdir(PATCH_DIR)).filter((f) => f.endsWith(".patch"))
if (files.length === 0) process.exit(0)

/**
 * Parse a patch filename into a package name. Strips `.patch` then splits on
 * the version delimiter (`@` for bun-format, last `+` for patch-package).
 */
function packageNameFromFile(file) {
  const stem = file.replace(/\.patch$/, "")
  const decoded = decodeURIComponent(stem)

  if (decoded.includes("+") && !decoded.endsWith("+")) {
    // patch-package: <pkg>+<ver>, scoped: @scope+<pkg>+<ver>
    const parts = decoded.split("+")
    if (parts[0].startsWith("@") && parts.length >= 3) {
      return `${parts[0]}/${parts[1]}`
    }
    return parts[0]
  }

  // bun: <pkg>@<ver>, scoped: @scope/<pkg>@<ver>
  const at = decoded.lastIndexOf("@")
  if (at <= 0) {
    throw new Error(`unparseable patch filename: ${file}`)
  }
  return decoded.slice(0, at)
}

let failed = 0
let applied = 0
let skipped = 0
let missing = 0

for (const file of files) {
  let pkg
  try {
    pkg = packageNameFromFile(file)
  } catch (err) {
    console.error(`apply-patches: ${file}: ${err.message}`)
    failed++
    continue
  }

  const pkgDir = resolve(ROOT, "node_modules", pkg)
  if (!existsSync(pkgDir)) {
    console.error(`apply-patches: ${pkg} not installed, skipping`)
    missing++
    continue
  }

  const patchPath = resolve(ROOT, PATCH_DIR, file)

  // Dry-run first to gate the real apply. `--dry-run` does not write reject
  // files, so this is safe to run repeatedly. `-N` makes patch detect
  // already-applied hunks instead of prompting.
  const dry = spawnSync("patch", ["-p1", "-N", "--dry-run", "-i", patchPath], {
    cwd: pkgDir,
    stdio: ["ignore", "pipe", "pipe"],
  })
  const dryOut = (dry.stderr?.toString() ?? "") + (dry.stdout?.toString() ?? "")
  const alreadyApplied =
    /Skipping patch|Ignoring previously applied|Reversed \(or previously applied\) patch detected/.test(
      dryOut,
    )

  if (alreadyApplied) {
    console.error(`apply-patches: ${pkg} already patched`)
    skipped++
    continue
  }

  if (dry.status !== 0) {
    console.error(`apply-patches: ${pkg} FAILED (dry-run exit ${dry.status})`)
    if (dryOut.trim()) console.error(dryOut.trim())
    failed++
    continue
  }

  // Real apply.
  const apply = spawnSync("patch", ["-p1", "-N", "-i", patchPath], {
    cwd: pkgDir,
    stdio: ["ignore", "pipe", "pipe"],
  })
  if (apply.status === 0) {
    console.error(`apply-patches: ${pkg} ok`)
    applied++
  } else {
    const out = (apply.stderr?.toString() ?? "") + (apply.stdout?.toString() ?? "")
    console.error(`apply-patches: ${pkg} FAILED (exit ${apply.status})`)
    if (out.trim()) console.error(out.trim())
    failed++
  }
}

const summary = [
  applied && `${applied} applied`,
  skipped && `${skipped} already applied`,
  missing && `${missing} missing pkg`,
  failed && `${failed} failed`,
]
  .filter(Boolean)
  .join(", ")
console.error(`apply-patches: ${summary}`)

process.exit(failed > 0 ? 1 : 0)
