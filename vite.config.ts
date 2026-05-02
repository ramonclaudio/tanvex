import tailwindcss from "@tailwindcss/vite"
import { devtools } from "@tanstack/devtools-vite"
import { tanstackStart } from "@tanstack/react-start/plugin/vite"
import viteReact from "@vitejs/plugin-react"
import { nitro } from "nitro/vite"
import { visualizer } from "rollup-plugin-visualizer"
import { defineConfig, loadEnv } from "vite"

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
    },
    resolve: {
      tsconfigPaths: true,
    },
    optimizeDeps: {
      entries: ["src/**/*.{ts,tsx}"],
      exclude: ["@base-ui/react", "@convex/_generated/api"],
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
