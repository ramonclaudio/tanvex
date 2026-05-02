#!/usr/bin/env bun
import { existsSync } from "node:fs"

import { $ } from "bun"

const paths = [
  "node_modules",
  "bun.lock",
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

async function step<T>(name: string, fn: () => Promise<T>) {
  const start = performance.now()
  console.log(`→ ${name}`)
  try {
    const result = await fn()
    console.log(`  ✓ ${((performance.now() - start) / 1000).toFixed(1)}s`)
    return result
  } catch (err) {
    console.log(`  ✗ ${((performance.now() - start) / 1000).toFixed(1)}s`)
    throw err
  }
}

const startedAt = performance.now()

await step("trash generated artifacts", async () => {
  for (const p of paths) {
    if (existsSync(p)) await $`trash ${p}`.quiet()
  }
  await $`find . -name .DS_Store -not -path './node_modules/*' -exec trash {} +`.quiet().nothrow()
})

await step("bun install", () => $`bun install`.quiet())
await step("convex ai-files update", () => $`bunx convex ai-files update`.quiet())
await step("convex dev --once", () => $`bunx convex dev --once`.quiet())
await step("vite build", () => $`bunx vite build`.quiet())
await step("tsc --noEmit", () => $`bunx tsc --noEmit`.quiet())

console.log(`\n✓ ${((performance.now() - startedAt) / 1000).toFixed(1)}s total`)
