/// <reference types="vite/client" />
import { register as registerBetterAuth } from "@convex-dev/better-auth/test"
import { register as registerRateLimiter } from "@convex-dev/rate-limiter/test"
import { register as registerResend } from "@convex-dev/resend/test"
import { convexTest } from "convex-test"
import type { TestConvex } from "convex-test"

import { components, internal } from "./_generated/api"
import schema from "./schema"

export const modules = import.meta.glob("./**/*.ts")

let seedCounter = 0

export function initConvexTest(): TestConvex<typeof schema> {
  const t = convexTest(schema, modules)
  registerBetterAuth(t)
  registerRateLimiter(t)
  registerResend(t)
  return t
}

/**
 * Seed a Better Auth user + session in the component tables, fire the real
 * onCreate trigger (which inserts the app users row), and return a test
 * accessor authenticated as that user. Mirrors what the convex plugin puts in
 * the JWT: subject = auth user id, sessionId = session id.
 */
export async function seedAuthedUser(
  t: TestConvex<typeof schema>,
  overrides: {
    name?: string
    email?: string
    username?: string | null
    // Past-date this to seed an already-expired session.
    sessionExpiresAt?: number
  } = {},
) {
  const now = Date.now()
  const seed = ++seedCounter
  const authUser = (await t.run(async (ctx) => {
    return await ctx.runMutation(components.betterAuth.adapter.create, {
      input: {
        model: "user",
        data: {
          name: overrides.name ?? "Test User",
          email: overrides.email ?? `test-${seed}@example.com`,
          emailVerified: true,
          // Omit username unless set: the component's unique check treats
          // explicit nulls as colliding values.
          ...(overrides.username != null && { username: overrides.username }),
          createdAt: now,
          updatedAt: now,
        },
      },
    })
  })) as { _id: string }

  const session = (await t.run(async (ctx) => {
    return await ctx.runMutation(components.betterAuth.adapter.create, {
      input: {
        model: "session",
        data: {
          userId: authUser._id,
          token: `test-session-token-${seed}`,
          expiresAt: overrides.sessionExpiresAt ?? now + 24 * 60 * 60 * 1000,
          createdAt: now,
          updatedAt: now,
        },
      },
    })
  })) as { _id: string }

  await t.mutation(internal.auth.onCreate, { model: "user", doc: authUser })

  const asUser = t.withIdentity({ subject: authUser._id, sessionId: session._id })
  return { asUser, authUser, session }
}
