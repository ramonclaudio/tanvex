import { corsRouter } from "convex-helpers/server/cors"
import { httpRouter } from "convex/server"
import { v } from "convex/values"

import { api, internal } from "./_generated/api"
import { httpAction, internalMutation } from "./_generated/server"
import { authComponent, createAuth } from "./auth"
import { resend } from "./email"
import { consumeLimit } from "./rateLimit"
import type { RateLimitName } from "./rateLimit"

// ============================================================================
// Environment Validation
// ============================================================================

/**
 * Get the site URL with validation.
 * Logs warning in development, throws in production if missing.
 */
function getSiteUrl(): string {
  const url = process.env.SITE_URL
  if (!url) {
    // In production, this is a critical configuration error
    if (process.env.NODE_ENV === "production") {
      console.error(
        "[HTTP] CRITICAL: SITE_URL environment variable is not set. " +
          "CORS will fall back to localhost which is insecure in production.",
      )
    }
    return "http://localhost:3000"
  }
  return url
}

// ============================================================================
// Internal mutation for HTTP rate limiting
// ============================================================================

/**
 * Check API rate limit from HTTP actions.
 * Returns ok: true if allowed, ok: false with retryAt if rate limited.
 *
 * Note: Auth-related rate limiting (sign-in, sign-up, password reset) is handled
 * by Better Auth at the HTTP layer. This mutation is for non-auth API endpoints.
 * Exposed as internalMutation since it's only called from httpActions in this file.
 */
export const checkApiRateLimit = internalMutation({
  args: {
    key: v.string(),
    name: v.union(v.literal("apiRead"), v.literal("apiWrite"), v.literal("userAction")),
  },
  returns: v.object({
    ok: v.boolean(),
    retryAt: v.number(),
  }),
  handler: async (ctx, args) => {
    const result = await consumeLimit(ctx, args.name as RateLimitName, args.key)
    return {
      ok: result.ok,
      retryAt: result.retryAfter ?? Date.now(),
    }
  },
})

// Create base HTTP router
const http = httpRouter()

// Register Better Auth routes lazily so Better Auth is not initialized at
// module load. This reduces http.ts memory footprint during `convex deploy`.
// No CORS/trustedOrigins passed — this app uses the TanStack Start proxy at
// src/routes/api/auth/$.ts, so browser→Convex auth traffic is never cross-origin.
authComponent.registerRoutesLazy(http, createAuth)

// Resend delivery events webhook. Point your Resend dashboard webhook at
// https://<your-project>.convex.site/resend-webhook and set
// RESEND_WEBHOOK_SECRET on the Convex deployment for signature verification.
// Signed events get forwarded to `onEmailEvent` (see convex/email.ts) and
// persisted to the component's `deliveryEvents` table automatically.
http.route({
  path: "/resend-webhook",
  method: "POST",
  handler: httpAction(async (ctx, req) => {
    return await resend.handleResendEventWebhook(ctx, req)
  }),
})

// CORS configuration for custom API endpoints
const siteUrl = getSiteUrl()
const corsConfig = {
  // Allow requests from your frontend domain(s)
  allowedOrigins: [
    siteUrl,
    // Add additional allowed origins here for multi-domain setups
  ],
  // Allow credentials for auth cookies
  allowCredentials: true,
  // Allowed headers
  allowedHeaders: ["Content-Type", "Authorization", "X-Requested-With"],
  // Cache preflight requests for 1 day
  browserCacheMaxAge: 86400,
}

// Create CORS-enabled router for custom API routes
const cors = corsRouter(http, corsConfig)

// ============================================================================
// Public API Endpoints (rate limited with CORS)
// ============================================================================

/**
 * Health check endpoint
 * GET /api/health
 */
cors.route({
  path: "/api/health",
  method: "GET",
  handler: httpAction(async () => {
    return new Response(
      JSON.stringify({
        status: "healthy",
        timestamp: Date.now(),
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json" },
      },
    )
  }),
})

/**
 * Extract the client IP from x-forwarded-for header.
 * Handles comma-separated lists (proxies add IPs to the list).
 */
function getClientIp(request: Request): string {
  const forwardedFor = request.headers.get("x-forwarded-for")
  if (forwardedFor) {
    // x-forwarded-for can be "client, proxy1, proxy2" - get the first (client) IP
    return forwardedFor.split(",")[0].trim()
  }
  return "unknown"
}

/**
 * Get public user profile by ID
 * GET /api/users?id=...
 * Rate limited by IP address
 */
cors.route({
  path: "/api/users",
  method: "GET",
  handler: httpAction(async (ctx, request) => {
    const url = new URL(request.url)
    const userId = url.searchParams.get("id")

    if (!userId) {
      return new Response(JSON.stringify({ error: "User ID is required" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      })
    }

    // Rate limit by client IP (handles x-forwarded-for properly)
    const ip = getClientIp(request)
    const rateLimitResult = await ctx.runMutation(internal.http.checkApiRateLimit, {
      key: `api:${ip}`,
      name: "apiRead",
    })

    if (!rateLimitResult.ok) {
      return new Response(
        JSON.stringify({
          error: "Rate limit exceeded",
          retryAt: rateLimitResult.retryAt,
        }),
        {
          status: 429,
          headers: {
            "Content-Type": "application/json",
            "Retry-After": String(Math.ceil((rateLimitResult.retryAt - Date.now()) / 1000)),
          },
        },
      )
    }

    // getUser normalizes the id internally and returns null on malformed input
    // or missing record, so we treat both as 404.
    const user = await ctx.runQuery(api.users.getUser, { userId })

    if (!user) {
      return new Response(JSON.stringify({ error: "User not found" }), {
        status: 404,
        headers: { "Content-Type": "application/json" },
      })
    }

    return new Response(JSON.stringify(user), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    })
  }),
})

/**
 * List users with pagination
 * GET /api/users/list?cursor=...&limit=...
 * Rate limited by IP address
 */
cors.route({
  path: "/api/users/list",
  method: "GET",
  handler: httpAction(async (ctx, request) => {
    const url = new URL(request.url)
    const cursor = url.searchParams.get("cursor") || undefined
    const limit = parseInt(url.searchParams.get("limit") || "20", 10)

    // Rate limit by client IP (handles x-forwarded-for properly)
    const ip = getClientIp(request)
    const rateLimitResult = await ctx.runMutation(internal.http.checkApiRateLimit, {
      key: `api:${ip}`,
      name: "apiRead",
    })

    if (!rateLimitResult.ok) {
      return new Response(
        JSON.stringify({
          error: "Rate limit exceeded",
          retryAt: rateLimitResult.retryAt,
        }),
        {
          status: 429,
          headers: {
            "Content-Type": "application/json",
            "Retry-After": String(Math.ceil((rateLimitResult.retryAt - Date.now()) / 1000)),
          },
        },
      )
    }

    const result = await ctx.runQuery(api.users.listUsers, {
      cursor,
      limit: Math.min(Math.max(limit, 1), 100),
    })

    return new Response(JSON.stringify(result), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    })
  }),
})

// Export the underlying HTTP router (cors.http is the actual HttpRouter)
export default http
