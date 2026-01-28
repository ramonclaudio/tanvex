/**
 * Rate Limiting Configuration
 *
 * Uses the @convex-dev/rate-limiter component for APPLICATION-LEVEL rate limiting.
 * This component-based approach has advantages over convex-helpers:
 * - No schema pollution (no tables in your schema)
 * - Better observability and debugging
 * - Component isolation
 *
 * IMPORTANT: Authentication-related rate limiting (sign-in, sign-up, password reset)
 * is handled by Better Auth at the HTTP layer. See convex/auth.ts for that config.
 * This file only contains rate limits for non-auth Convex operations.
 *
 * IMPORTANT - JITTER FOR CLIENTS:
 * When rate limited, clients should add random jitter (e.g., 0-1000ms) to the retryAfter
 * timestamp before retrying. This prevents the "thundering herd" problem where many
 * clients retry at the exact same moment.
 *
 * Example client-side retry logic:
 * ```typescript
 * const jitter = Math.random() * 1000; // 0-1000ms random delay
 * const retryDelay = Math.max(0, retryAfter - Date.now()) + jitter;
 * await new Promise(resolve => setTimeout(resolve, retryDelay));
 * ```
 *
 * @see https://www.convex.dev/components/rate-limiter
 */

import {
  DAY,
  HOUR,
  MINUTE,
  RateLimiter,
  SECOND,
  WEEK,
  isRateLimitError,
} from '@convex-dev/rate-limiter'
import { components } from './_generated/api'
import type { MutationCtx, QueryCtx } from './_generated/server'

// Re-export time constants for convenience
export { SECOND, MINUTE, HOUR, DAY, WEEK }

// Re-export error type guard
export { isRateLimitError }

/**
 * Rate limiter instance using the component.
 * Defines all application rate limits in one place.
 *
 * Sharding: For high-throughput limits, we use sharding to reduce contention.
 * Rule of thumb: Target QPS / 2 = recommended shard count.
 * Each shard should have capacity of 5-10+ tokens.
 */
export const rateLimiter = new RateLimiter(components.rateLimiter, {
  // ============================================================================
  // API Rate Limits (for HTTP endpoints and external API access)
  // ============================================================================

  // Read operations: More permissive for good UX
  // Sharded for high throughput (100 req/min = ~1.7 QPS, 2 shards is safe)
  apiRead: {
    kind: 'token bucket',
    rate: 100, // 100 requests per minute
    period: MINUTE,
    capacity: 20, // allow burst of 20 extra
    shards: 2, // Handle concurrent requests better
  },

  // Write operations: Stricter to prevent abuse
  apiWrite: {
    kind: 'token bucket',
    rate: 30, // 30 writes per minute
    period: MINUTE,
    capacity: 10, // allow burst of 10 extra
  },

  // ============================================================================
  // User Action Rate Limits (for authenticated user operations)
  // ============================================================================

  // General user actions: Profile updates, settings changes, etc.
  userAction: {
    kind: 'token bucket',
    rate: 60, // 60 actions per minute
    period: MINUTE,
    capacity: 10, // allow burst of 10 extra
  },

  // ============================================================================
  // Reserved Capacity Rate Limits (for critical operations)
  // ============================================================================

  // For operations that MUST eventually succeed (e.g., scheduled jobs)
  // Use with reserve: true to guarantee execution slots
  criticalAction: {
    kind: 'token bucket',
    rate: 10, // 10 per minute
    period: MINUTE,
    capacity: 5,
    maxReserved: 20, // Allow reserving up to 20 slots ahead
  },
})

// Type for rate limit names defined above
export type RateLimitName = 'apiRead' | 'apiWrite' | 'userAction' | 'criticalAction'

/**
 * Helper to apply rate limit and throw automatically if exceeded.
 * Uses the component's limit method with throws option.
 *
 * @example
 * // This will throw a ConvexError with RateLimitError data if rate limited
 * await rateLimitWithThrow(ctx, "userAction", userId);
 *
 * // Catch and handle:
 * try {
 *   await rateLimitWithThrow(ctx, "userAction", userId);
 * } catch (error) {
 *   if (isRateLimitError(error)) {
 *     return { error: "Too many requests", retryAfter: error.data.retryAfter };
 *   }
 *   throw error;
 * }
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
 * Check rate limit without consuming tokens (read-only).
 * Useful for checking before performing an expensive operation.
 * Can be used in queries since it doesn't consume tokens.
 *
 * @example
 * const status = await checkLimit(ctx, "apiWrite", userId);
 * if (!status.ok) {
 *   return { error: "Rate limited", retryAfter: status.retryAfter };
 * }
 */
export async function checkLimit(
  ctx: QueryCtx | MutationCtx,
  name: RateLimitName,
  key?: string,
  count?: number,
) {
  return rateLimiter.check(ctx, name, { key, count })
}

/**
 * Consume rate limit tokens.
 * Returns status with ok boolean and retryAfter timestamp if rate limited.
 *
 * @example
 * const status = await consumeLimit(ctx, "apiWrite", userId);
 * if (!status.ok) {
 *   return { error: "Rate limited", retryAfter: status.retryAfter };
 * }
 */
export async function consumeLimit(
  ctx: MutationCtx,
  name: RateLimitName,
  key?: string,
  count?: number,
) {
  return rateLimiter.limit(ctx, name, { key, count })
}

/**
 * Consume rate limit with reserved capacity.
 * Use this for critical operations that MUST eventually succeed.
 * Instead of failing immediately, it reserves a future slot.
 *
 * @example
 * const status = await consumeWithReserve(ctx, "criticalAction", userId);
 * if (status.retryAfter && status.retryAfter > 0) {
 *   // Schedule for later - capacity is guaranteed at that time
 *   await ctx.scheduler.runAfter(
 *     status.retryAfter,
 *     internal.myModule.doWork,
 *     { skipRateLimit: true }
 *   );
 *   return { scheduled: true, executeAt: Date.now() + status.retryAfter };
 * }
 * // Execute immediately
 */
export async function consumeWithReserve(
  ctx: MutationCtx,
  name: RateLimitName,
  key?: string,
  count?: number,
) {
  return rateLimiter.limit(ctx, name, { key, count, reserve: true })
}

/**
 * Reset a rate limit for a specific key.
 * Useful for admin operations or testing.
 *
 * @example
 * // Reset a user's rate limit (admin action)
 * await resetLimit(ctx, "userAction", userId);
 */
export async function resetLimit(
  ctx: MutationCtx,
  name: RateLimitName,
  key?: string,
) {
  return rateLimiter.reset(ctx, name, { key })
}

/**
 * Get current rate limit value and metadata.
 * Useful for admin dashboards and debugging.
 * Does NOT consume any tokens.
 *
 * @example
 * const info = await getRateLimitValue(ctx, "userAction", userId);
 * // info = { value: 45, ts: 1234567890, shard: 0, config: {...} }
 */
export async function getRateLimitValue(
  ctx: QueryCtx | MutationCtx,
  name: RateLimitName,
  key?: string,
) {
  return rateLimiter.getValue(ctx, name, { key })
}

// ============================================================================
// React Hook Integration
// ============================================================================

/**
 * Server-side API for the useRateLimit React hook.
 * Exposes rate limit status to the client for UI feedback.
 *
 * Usage in your component:
 * ```tsx
 * import { useRateLimit } from "@convex-dev/rate-limiter/react";
 * import { api } from "../convex/_generated/api";
 *
 * function MyComponent() {
 *   const { status, check } = useRateLimit(api.rateLimit.getUserActionRateLimit, {
 *     getServerTimeMutation: api.rateLimit.getServerTime,
 *   });
 *
 *   if (status && !status.ok) {
 *     return <div>Please wait {Math.ceil(status.retryAfter / 1000)}s</div>;
 *   }
 *
 *   return <button disabled={status && !status.ok}>Submit</button>;
 * }
 * ```
 */

// Export hook API for userAction rate limit (most common use case)
export const {
  getRateLimit: getUserActionRateLimit,
  getServerTime,
} = rateLimiter.hookAPI('userAction', {
  // Key is derived server-side from the authenticated user
  // This prevents clients from checking other users' rate limits
  key: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity()
    return identity?.subject ?? 'anonymous'
  },
})

// Export hook API for apiRead rate limit
export const {
  getRateLimit: getApiReadRateLimit,
} = rateLimiter.hookAPI('apiRead', {
  // For API rate limits, we accept the key from the client
  // (typically an IP address or API key)
  key: async (_ctx, clientKey?: string) => {
    return clientKey ?? 'anonymous'
  },
})

// ============================================================================
// Client-Side Utilities (for use in frontend code)
// ============================================================================

/**
 * Calculate retry delay with jitter to prevent thundering herd.
 * Use this on the client side when you receive a retryAfter timestamp.
 *
 * @param retryAfter - Milliseconds until the rate limit resets
 * @param maxJitter - Maximum jitter in milliseconds (default 1000ms)
 * @returns The delay in milliseconds to wait before retrying
 *
 * @example
 * // In your frontend code:
 * import { calculateRetryDelay } from '../convex/rateLimit';
 *
 * try {
 *   await mutation();
 * } catch (error) {
 *   if (isRateLimitError(error)) {
 *     const delay = calculateRetryDelay(error.data.retryAfter);
 *     await new Promise(resolve => setTimeout(resolve, delay));
 *     // Retry the operation
 *   }
 * }
 */
export function calculateRetryDelay(retryAfter: number, maxJitter = 1000): number {
  const jitter = Math.random() * maxJitter
  return retryAfter + jitter
}
