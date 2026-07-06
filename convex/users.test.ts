// @vitest-environment edge-runtime
import { ConvexError } from "convex/values"
import { describe, expect, test } from "vitest"

import { api } from "./_generated/api"
import { initConvexTest, seedAuthedUser } from "./test.helpers"

describe("auth enforcement on the wrappers", () => {
  test("optionalAuthQuery: getMe returns null when unauthenticated", async () => {
    const t = initConvexTest()
    expect(await t.query(api.users.getMe, {})).toBeNull()
  })

  test("authMutation: updateProfile throws AUTH_1001 when unauthenticated", async () => {
    const t = initConvexTest()
    const err = await t.mutation(api.users.updateProfile, { bio: "hi" }).catch((e: unknown) => e)
    expect(err).toBeInstanceOf(ConvexError)
    expect((err as ConvexError<{ code: string }>).data.code).toBe("AUTH_1001")
  })

  test("getMe merges Better Auth identity with the app users row", async () => {
    const t = initConvexTest()
    const { asUser } = await seedAuthedUser(t, { name: "Ada", email: "ada@example.com" })
    const me = await asUser.query(api.users.getMe, {})
    expect(me).not.toBeNull()
    expect(me?.name).toBe("Ada")
    expect(me?.email).toBe("ada@example.com")
    expect(me?.bio).toBeUndefined()
    expect(me?.avatarUrl).toBeNull()
  })

  test("an identity without a live session is not authenticated", async () => {
    const t = initConvexTest()
    const ghost = t.withIdentity({ subject: "nope", sessionId: "nope" })
    expect(await ghost.query(api.users.getMe, {})).toBeNull()
  })

  test("an expired session is not authenticated", async () => {
    const t = initConvexTest()
    // A real user and session, but the session expired an hour ago.
    const { asUser } = await seedAuthedUser(t, { sessionExpiresAt: Date.now() - 60 * 60 * 1000 })
    expect(await asUser.query(api.users.getMe, {})).toBeNull()
  })
})

describe("updateProfile bio validation", () => {
  test("accepts a bio at the 500-char limit", async () => {
    const t = initConvexTest()
    const { asUser } = await seedAuthedUser(t)
    await asUser.mutation(api.users.updateProfile, { bio: "x".repeat(500) })
    const me = await asUser.query(api.users.getMe, {})
    expect(me?.bio).toHaveLength(500)
  })

  test("rejects a bio over 500 chars with VAL_3001 on the bio field", async () => {
    const t = initConvexTest()
    const { asUser } = await seedAuthedUser(t)
    const err = await asUser
      .mutation(api.users.updateProfile, { bio: "x".repeat(501) })
      .catch((e: unknown) => e)
    expect(err).toBeInstanceOf(ConvexError)
    const data = (err as ConvexError<{ code: string; field?: string }>).data
    expect(data.code).toBe("VAL_3001")
    expect(data.field).toBe("bio")
  })

  test("omitting bio clears it (the client sends undefined to reset)", async () => {
    const t = initConvexTest()
    const { asUser } = await seedAuthedUser(t)
    await asUser.mutation(api.users.updateProfile, { bio: "temporary" })
    await asUser.mutation(api.users.updateProfile, {})
    const me = await asUser.query(api.users.getMe, {})
    expect(me?.bio).toBeUndefined()
  })
})

describe("avatar storage-id handling", () => {
  test("updateAvatar stores the blob and resolves a url", async () => {
    const t = initConvexTest()
    const { asUser } = await seedAuthedUser(t)
    const storageId = await t.run(async (ctx) => {
      return await ctx.storage.store(new Blob(["png-bytes"]))
    })
    const result = await asUser.mutation(api.users.updateAvatar, { storageId })
    expect(result.avatarUrl).not.toBeNull()
    const me = await asUser.query(api.users.getMe, {})
    expect(me?.hasUploadedAvatar).toBe(true)
    expect(me?.avatarUrl).toBe(result.avatarUrl)
  })

  test("updateAvatar deletes the previous uploaded blob", async () => {
    const t = initConvexTest()
    const { asUser } = await seedAuthedUser(t)
    const first = await t.run(async (ctx) => ctx.storage.store(new Blob(["one"])))
    const second = await t.run(async (ctx) => ctx.storage.store(new Blob(["two"])))
    await asUser.mutation(api.users.updateAvatar, { storageId: first })
    await asUser.mutation(api.users.updateAvatar, { storageId: second })
    const firstMeta = await t.run(async (ctx) => ctx.db.system.get(first))
    expect(firstMeta).toBeNull()
  })

  test("updateAvatar rejects a storage id whose blob does not exist", async () => {
    const t = initConvexTest()
    const { asUser } = await seedAuthedUser(t)
    const storageId = await t.run(async (ctx) => {
      const id = await ctx.storage.store(new Blob(["gone"]))
      await ctx.storage.delete(id)
      return id
    })
    const err = await asUser
      .mutation(api.users.updateAvatar, { storageId })
      .catch((e: unknown) => e)
    expect(err).toBeInstanceOf(ConvexError)
    expect((err as ConvexError<{ code: string }>).data.code).toBe("VAL_3001")
  })

  test("deleteAvatar frees the blob and falls back to no avatar", async () => {
    const t = initConvexTest()
    const { asUser } = await seedAuthedUser(t)
    const storageId = await t.run(async (ctx) => ctx.storage.store(new Blob(["pic"])))
    await asUser.mutation(api.users.updateAvatar, { storageId })
    await asUser.mutation(api.users.deleteAvatar, {})
    const meta = await t.run(async (ctx) => ctx.db.system.get(storageId))
    expect(meta).toBeNull()
    const me = await asUser.query(api.users.getMe, {})
    expect(me?.hasUploadedAvatar).toBe(false)
    expect(me?.avatarUrl).toBeNull()
  })
})
