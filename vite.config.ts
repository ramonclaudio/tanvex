import tailwindcss from "@tailwindcss/vite"
import { devtools } from "@tanstack/devtools-vite"
import { tanstackStart } from "@tanstack/react-start/plugin/vite"
import viteReact from "@vitejs/plugin-react"
import { nitro } from "nitro/vite"
import { visualizer } from "rollup-plugin-visualizer"
import { defineConfig, loadEnv } from "vite"

// Commit SHA injected into the bundle so deploy CI can verify each platform
// is serving the latest commit (see `.github/actions/wait-for-sha`). Read
// from whatever git env var the host CI provides.
const commitSha =
  process.env.VERCEL_GIT_COMMIT_SHA ??
  process.env.COMMIT_REF ??
  process.env.WORKERS_CI_COMMIT_SHA ??
  process.env.CF_PAGES_COMMIT_SHA ??
  process.env.GITHUB_SHA ??
  ""

const securityHeaders: Record<string, string> = {
  "strict-transport-security": "max-age=63072000; includeSubDomains",
  "x-content-type-options": "nosniff",
  "x-frame-options": "DENY",
  "referrer-policy": "strict-origin-when-cross-origin",
  "permissions-policy": "camera=(), microphone=(), geolocation=()",
  "cross-origin-opener-policy": "same-origin-allow-popups",
  "cross-origin-resource-policy": "same-origin",
  "origin-agent-cluster": "?1",
}

// Derive CONVEX_SITE_URL from CONVEX_DEPLOYMENT when not set explicitly.
// e.g. "dev:foo" -> "https://foo.convex.site"
function getConvexSiteUrl(deployment: string | undefined) {
  if (!deployment) return undefined
  const projectName = deployment.split(":")[1]
  return `https://${projectName}.convex.site`
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "")
  const convexUrl = env.VITE_CONVEX_URL
  const convexSiteUrl = env.VITE_CONVEX_SITE_URL || getConvexSiteUrl(env.CONVEX_DEPLOYMENT)
  const siteUrl = env.SITE_URL || "http://localhost:3000"

  return {
    server: {
      port: 3000,
      warmup: {
        clientFiles: [
          "./src/router.tsx",
          "./src/routes/**/*.{ts,tsx}",
          "./src/components/**/*.tsx",
          "./src/lib/*.ts",
          "./src/styles.css",
        ],
      },
    },
    resolve: {
      tsconfigPaths: true,
    },
    optimizeDeps: {
      include: [
        "@better-auth/core/db",
        "@better-auth/core/env",
        "@better-auth/core/error",
        "@better-auth/core/utils/db",
        "@better-auth/core/utils/error-codes",
        "@better-auth/core/utils/json",
        "@better-auth/core/utils/string",
        "@better-auth/utils/base64",
        "@better-auth/utils/binary",
        "@better-auth/utils/hmac",
        "@better-fetch/fetch",
        "@noble/hashes/hkdf.js",
        "@noble/hashes/sha2.js",
        "@tanstack/router-core",
        "@tanstack/router-core/ssr/client",
        "defu",
        "jose",
        "nanostores",
        "seroval",
      ],
    },
    ssr: {
      // Prevent AsyncLocalStorage context loss for Better Auth on the server.
      noExternal: ["@convex-dev/better-auth"],
    },
    define: {
      "process.env.VITE_CONVEX_URL": JSON.stringify(convexUrl),
      "process.env.VITE_CONVEX_SITE_URL": JSON.stringify(convexSiteUrl),
      "process.env.CONVEX_SITE_URL": JSON.stringify(convexSiteUrl),
      "process.env.SITE_URL": JSON.stringify(siteUrl),
      "import.meta.env.VITE_COMMIT_SHA": JSON.stringify(commitSha),
    },
    plugins: [
      devtools(),
      tailwindcss(),
      tanstackStart({ srcDirectory: "src" }),
      viteReact(),
      nitro({
        routeRules: {
          "/**": { headers: securityHeaders },
        },
      }),
      process.env.ANALYZE &&
        visualizer({
          filename: ".output/stats.html",
          open: true,
          gzipSize: true,
          brotliSize: true,
        }),
    ].filter(Boolean),
  }
})
