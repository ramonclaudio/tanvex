/// <reference types="vite/client" />

// Only VITE_-prefixed vars exist on import.meta.env. The server-side vars
// (SITE_URL, CONVEX_DEPLOYMENT) reach code through process.env via the
// define block in vite.config.ts and must not be typed here.
interface ImportMetaEnv {
  readonly VITE_SITE_URL?: string
  readonly VITE_CONVEX_URL?: string
  readonly VITE_CONVEX_SITE_URL?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
