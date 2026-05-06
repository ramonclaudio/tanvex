/**
 * Origin/CORS configuration shared between Better Auth (`trustedOrigins`)
 * and the Convex CORS router (`allowedOrigins` for `/api/*`).
 *
 * Two env vars on the Convex deployment:
 *
 * - `SITE_URL`: canonical/primary URL. Used as Better Auth's `baseURL`,
 *   the default CORS origin, and the SSR fallback. There's only ever ONE.
 *   In emails, redirects, and OAuth callbacks Better Auth uses this URL.
 *
 * - `TRUSTED_ORIGINS`: optional, comma-separated. Additional URLs that
 *   are allowed to hit auth + API endpoints when the same Convex backend
 *   serves multiple frontend deploys (e.g. Vercel + Netlify, or a custom
 *   domain alongside the platform default).
 *
 *     bunx convex env set SITE_URL https://your-app.vercel.app --prod
 *     bunx convex env set TRUSTED_ORIGINS "https://your-app.netlify.app,https://www.example.com" --prod
 *
 * Limitation: emails, magic links, and OAuth callbacks always point to
 * `SITE_URL`. If a user signs up on a non-canonical host (e.g. one of the
 * URLs in `TRUSTED_ORIGINS`), the verification email link points back at
 * `SITE_URL`. For production with multiple equal hosts, run a separate
 * Convex deployment per host instead.
 */

/**
 * Resolve `SITE_URL`. Logs a warning and falls back to `http://localhost:3000`
 * if unset so the module can still load (e.g. during codegen or initial
 * provisioning before env vars are written).
 */
export function getSiteUrl(): string {
  const url = process.env.SITE_URL
  if (!url) {
    if (process.env.NODE_ENV === "production") {
      console.error(
        "[Convex] CRITICAL: SITE_URL is not set. Auth redirects and CORS will misbehave.",
      )
    }
    return "http://localhost:3000"
  }
  return url
}

/**
 * Parse `TRUSTED_ORIGINS` into a deduplicated array of additional allowed
 * origins. Returns an empty array when unset (single-host deploys).
 */
export function getTrustedOrigins(): Array<string> {
  const raw = process.env.TRUSTED_ORIGINS
  if (!raw) return []
  return Array.from(
    new Set(
      raw
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean),
    ),
  )
}

/**
 * Combined allowed origins: `SITE_URL` plus everything in `TRUSTED_ORIGINS`.
 * Used by `corsRouter` in `convex/http.ts`. Better Auth uses `getSiteUrl()`
 * as `baseURL` and `getTrustedOrigins()` as the supplementary list.
 */
export function getAllowedOrigins(): Array<string> {
  return Array.from(new Set([getSiteUrl(), ...getTrustedOrigins()]))
}
