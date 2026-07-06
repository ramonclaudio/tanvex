import { convexBetterAuthReactStart } from "@convex-dev/better-auth/react-start"

// Static member access only: vite.config.ts's define block replaces these
// expressions with literals at build time (dynamic process.env[key] lookups
// would miss the substitution and read the runtime environment instead).
const convexUrl = process.env.VITE_CONVEX_URL
const convexSiteUrl = process.env.VITE_CONVEX_SITE_URL

if (!convexUrl || !convexSiteUrl) {
  throw new Error(
    "VITE_CONVEX_URL and VITE_CONVEX_SITE_URL must be set at build time " +
      "(run setup, or see .env.example). Auth cannot start without them.",
  )
}

export const { handler, getToken, fetchAuthQuery, fetchAuthMutation, fetchAuthAction } =
  convexBetterAuthReactStart({ convexUrl, convexSiteUrl })
