// @vitest-environment edge-runtime
import { ConvexError } from "convex/values"
import { describe, expect, test } from "vitest"

import { api, internal } from "./_generated/api"
import { initConvexTest, seedAuthedUser } from "./test.helpers"

describe("userAction rate limit on profile mutations", () => {
  test("exhausting the bucket throws a RateLimited ConvexError", async () => {
    const t = initConvexTest()
    const { asUser } = await seedAuthedUser(t)
    // Token bucket: capacity 10, refill 60/min. Burst past the capacity.
    let rateLimited: unknown
    for (let i = 0; i < 12; i++) {
      try {
        await asUser.mutation(api.users.updateProfile, { bio: `bio ${i}` })
      } catch (err) {
        rateLimited = err
        break
      }
    }
    expect(rateLimited).toBeInstanceOf(ConvexError)
    expect((rateLimited as ConvexError<{ kind: string; name: string }>).data).toMatchObject({
      kind: "RateLimited",
      name: "userAction",
    })
  })

  test("rate limit keys are per user", async () => {
    const t = initConvexTest()
    const { asUser: alice } = await seedAuthedUser(t, { email: "alice@example.com" })
    const { asUser: bob } = await seedAuthedUser(t, { email: "bob@example.com" })
    for (let i = 0; i < 10; i++) {
      await alice.mutation(api.users.updateProfile, { bio: `a${i}` })
    }
    // Alice is out of tokens, Bob is untouched.
    await expect(alice.mutation(api.users.updateProfile, { bio: "over" })).rejects.toThrow(
      /RateLimited/,
    )
    await expect(bob.mutation(api.users.updateProfile, { bio: "fine" })).resolves.toBeDefined()
  })
})

describe("checkApiRateLimit (HTTP api limiter)", () => {
  test("allows within the bucket and reports absolute retryAt when exhausted", async () => {
    const t = initConvexTest()
    const before = Date.now()
    const first = await t.mutation(internal.http.checkApiRateLimit, {
      key: "api:203.0.113.7",
      name: "apiRead",
    })
    expect(first.ok).toBe(true)
    let denied: { ok: boolean; retryAt: number } | undefined
    // apiRead: capacity 20 across 2 shards. 40 consumes must exhaust it.
    for (let i = 0; i < 40 && !denied; i++) {
      const result = await t.mutation(internal.http.checkApiRateLimit, {
        key: "api:203.0.113.7",
        name: "apiRead",
      })
      if (!result.ok) denied = result
    }
    expect(denied).toBeDefined()
    // retryAt is an absolute timestamp in the future, not a duration (AUDIT S6).
    expect(denied!.retryAt).toBeGreaterThan(before)
  })

  test("keys are independent", async () => {
    const t = initConvexTest()
    for (let i = 0; i < 40; i++) {
      await t.mutation(internal.http.checkApiRateLimit, {
        key: "api:198.51.100.1",
        name: "apiRead",
      })
    }
    const other = await t.mutation(internal.http.checkApiRateLimit, {
      key: "api:198.51.100.2",
      name: "apiRead",
    })
    expect(other.ok).toBe(true)
  })
})
