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

for (const p of paths) {
  if (existsSync(p)) await $`trash ${p}`
}

await $`find . -name .DS_Store -not -path './node_modules/*' -exec trash {} +`.nothrow()

await $`bun install`
await $`bunx convex ai-files update`
await $`bunx convex dev --once`
await $`bunx vite build`
await $`bunx tsc --noEmit`
