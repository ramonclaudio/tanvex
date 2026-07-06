/**
 * Rate Limiting Configuration
 *
 * Uses the @convex-dev/rate-limiter component for application-level rate limiting.
 *
 * Authentication-related rate limiting (sign-in, sign-up, password reset)
 * is handled by Better Auth at the HTTP layer. See convex/auth.ts.
 *
 * @see https://www.convex.dev/components/rate-limiter
 */

import { MINUTE, RateLimiter } from "@convex-dev/rate-limiter"

import { components } from "./_generated/api"
import type { MutationCtx } from "./_generated/server"

/**
 * Rate limiter instance using the component.
 * Defines all application rate limits in one place.
 */
export const rateLimiter = new RateLimiter(components.rateLimiter, {
  // Anonymous reads on the public HTTP API, keyed by client IP. Sharded for throughput.
  apiRead: {
    kind: "token bucket",
    rate: 100,
    period: MINUTE,
    capacity: 20,
    shards: 2,
  },

  // Authenticated user actions (profile and avatar mutations), keyed by user id.
  userAction: {
    kind: "token bucket",
    rate: 60,
    period: MINUTE,
    capacity: 10,
  },
})

export type RateLimitName = "apiRead" | "userAction"

/**
 * Apply a rate limit and throw automatically if exceeded.
 */
export async function rateLimitWithThrow(
  ctx: MutationCtx,
  name: RateLimitName,
  key?: string,
  count?: number,
) {
  return rateLimiter.limit(ctx, name, { key, count, throws: true })
}

/**
 * Consume rate limit tokens without throwing.
 * Returns { ok, retryAfter } so HTTP callers can build a 429 response.
 */
export async function consumeLimit(
  ctx: MutationCtx,
  name: RateLimitName,
  key?: string,
  count?: number,
) {
  return rateLimiter.limit(ctx, name, { key, count })
}
