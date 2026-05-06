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
 * Why `git apply` over the system `patch` binary? `patch` isn't always
 * present in minimal containers (Vercel's build image, some Alpine bases).
 * `git` is universally available wherever Node runs in CI or dev. `git apply`
 * also handles git-style headers (`new file mode 100644`, full SHA hashes)
 * cleanly, which is the format both `bun patch` and `patch-package` produce.
 *
 * Filename formats supported:
 *   <pkg>@<version>.patch                     (bun, URL-encoded scope)
 *   <pkg>+<version>.patch                     (patch-package, + separators)
 *   @scope%2F<pkg>@<version>.patch            (bun scoped)
 *   @scope+<pkg>+<version>.patch              (patch-package scoped)
 *
 * Idempotent: detects already-applied patches via reverse dry-run.
 * Safe to run twice.
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

/**
 * Run `git apply` with the given args. Captures stdout/stderr. Returns the
 * raw spawnSync result so callers can branch on `status` and `error`.
 *
 * Sets `GIT_CEILING_DIRECTORIES` to the repo root so git stops walking up
 * to find a parent `.git`. Without this, the parent repo's gitignore
 * (which excludes `node_modules`) makes `git apply` silently skip the
 * patches with a "Skipped patch" message and exit 0.
 */
function gitApply(args, patchPath, pkgDir) {
  return spawnSync("git", ["apply", ...args, "-p1", patchPath], {
    cwd: pkgDir,
    stdio: ["ignore", "pipe", "pipe"],
    env: { ...process.env, GIT_CEILING_DIRECTORIES: ROOT },
  })
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

  // Forward dry-run: can we apply cleanly?
  const fwdCheck = gitApply(["--check"], patchPath, pkgDir)

  if (fwdCheck.status === 0) {
    // Apply for real.
    const apply = gitApply([], patchPath, pkgDir)
    if (apply.status === 0) {
      console.error(`apply-patches: ${pkg} ok`)
      applied++
    } else {
      const out = (apply.stderr?.toString() ?? "") + (apply.stdout?.toString() ?? "")
      console.error(`apply-patches: ${pkg} FAILED (apply exit ${apply.status})`)
      if (out.trim()) console.error(out.trim())
      failed++
    }
    continue
  }

  // Forward failed: try reverse to see if patch is already applied.
  const revCheck = gitApply(["--reverse", "--check"], patchPath, pkgDir)
  if (revCheck.status === 0) {
    console.error(`apply-patches: ${pkg} already patched`)
    skipped++
    continue
  }

  // Both forward and reverse failed: real conflict, or git apply unavailable.
  const out = (fwdCheck.stderr?.toString() ?? "") + (fwdCheck.stdout?.toString() ?? "")
  console.error(`apply-patches: ${pkg} FAILED (forward check exit ${fwdCheck.status})`)
  if (fwdCheck.error) console.error(`spawn error: ${fwdCheck.error.message}`)
  if (out.trim()) console.error(out.trim())
  failed++
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
