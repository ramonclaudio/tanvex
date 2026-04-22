import { defineSchema, defineTable } from "convex/server"
import { v } from "convex/values"

// Rate limiting uses @convex-dev/rate-limiter component which manages its own tables.
// Better Auth handles identity tables (user, session, account, verification) via @convex-dev/better-auth.
//
// This app users table stores ONLY fields Better Auth can't represent:
// user bio and the Convex storage id for uploaded avatars.
// Identity fields (name, email, username, image) come from the Better Auth user and are
// merged at read time in convex/auth.ts safeGetAuthenticatedUser.

// Reusable field validators for the app users table.
export const userFields = {
  authId: v.string(), // FK to the Better Auth user id (indexed for efficient lookup)
  bio: v.optional(v.string()),
  avatar: v.optional(v.id("_storage")), // Convex storage id for uploaded avatars
  createdAt: v.number(),
  updatedAt: v.number(),
}

export default defineSchema({
  // App-specific user data. Better Auth owns identity fields.
  users: defineTable({
    authId: userFields.authId,
    bio: userFields.bio,
    avatar: userFields.avatar,
    createdAt: userFields.createdAt,
    updatedAt: userFields.updatedAt,
  }).index("authId", ["authId"]),
})
