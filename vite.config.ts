import { defineConfig, loadEnv } from 'vite'
import { devtools } from '@tanstack/devtools-vite'
import { tanstackStart } from '@tanstack/react-start/plugin/vite'
import viteReact from '@vitejs/plugin-react'
import viteTsConfigPaths from 'vite-tsconfig-paths'
import tailwindcss from '@tailwindcss/vite'

// Derive CONVEX_SITE_URL from CONVEX_DEPLOYMENT (e.g., "dev:project-name" -> "https://project-name.convex.site")
function getConvexSiteUrl(deployment: string | undefined) {
  if (!deployment) return undefined
  const projectName = deployment.split(':')[1]
  return `https://${projectName}.convex.site`
}

const config = defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const convexUrl = env.VITE_CONVEX_URL
  const convexSiteUrl = env.VITE_CONVEX_SITE_URL || getConvexSiteUrl(env.CONVEX_DEPLOYMENT)
  const siteUrl = env.SITE_URL || 'http://localhost:3000'

  return {
    ssr: {
      // Prevent AsyncLocalStorage context loss for these packages
      noExternal: ['@convex-dev/better-auth'],
    },
    define: {
      // Make env vars available on both client and server
      'process.env.VITE_CONVEX_URL': JSON.stringify(convexUrl),
      'process.env.VITE_CONVEX_SITE_URL': JSON.stringify(convexSiteUrl),
      'process.env.CONVEX_SITE_URL': JSON.stringify(convexSiteUrl),
      'process.env.SITE_URL': JSON.stringify(siteUrl),
    },
    plugins: [
      devtools(),
      // this is the plugin that enables path aliases
      viteTsConfigPaths({
        projects: ['./tsconfig.json'],
      }),
      tailwindcss(),
      tanstackStart(),
      viteReact(),
    ],
  }
})

export default config
