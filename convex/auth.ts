import { createClient } from "@convex-dev/better-auth"
import type { AuthFunctions, GenericCtx } from "@convex-dev/better-auth"
import { convex } from "@convex-dev/better-auth/plugins"
import type { BetterAuthOptions } from "better-auth"
import { betterAuth } from "better-auth/minimal"
import { emailOTP, username } from "better-auth/plugins"
import { v } from "convex/values"

import { components, internal } from "./_generated/api"
import type { DataModel, Doc } from "./_generated/dataModel"
import { internalAction, query } from "./_generated/server"
import type { MutationCtx, QueryCtx } from "./_generated/server"
import authConfig from "./auth.config"
import {
  USERNAME_FORMAT_REGEX,
  USERNAME_MAX_LENGTH,
  USERNAME_MIN_LENGTH,
  isReservedUsername,
} from "./constants"
import { sendAuthOTP } from "./email"
import { authenticationRequired } from "./errors"

/**
 * Get the site URL from environment.
 * Logs a warning and returns undefined if not set so Better Auth can handle it.
 * Allows the module to load even if the env var is missing (e.g. during codegen).
 */
function getSiteUrl(): string | undefined {
  const url = process.env.SITE_URL
  if (!url) {
    console.warn(
      "[Auth] SITE_URL environment variable is not set. " +
        "This is required for auth redirects to work correctly. " +
        "Set it in your Convex dashboard or .env.local file.",
    )
    return undefined
  }
  return url
}

const authFunctions: AuthFunctions = internal.auth

/**
 * Get the app user doc by Better Auth id, using the indexed lookup.
 */
export async function getUserByAuthId(
  ctx: QueryCtx | MutationCtx,
  authId: string,
): Promise<Doc<"users"> | null> {
  return await ctx.db
    .query("users")
    .withIndex("authId", (q) => q.eq("authId", authId))
    .unique()
}

/**
 * Merged representation of the authenticated user.
 *
 * Identity fields (email, name, username, image, emailVerified) come from the
 * Better Auth user. App-specific fields (_id, role, bio, avatar, timestamps)
 * come from our users table. `avatarUrl` is resolved: user-uploaded storage id
 * takes precedence, otherwise falls back to Better Auth's `image` (e.g. OAuth
 * provider avatar).
 */
export type AuthUser = Doc<"users"> & {
  authUserId: string
  email: string
  name: string
  emailVerified: boolean
  image: string | null
  username: string | null
  displayUsername: string | null
  avatarUrl: string | null
  hasUploadedAvatar: boolean
}

// The component client has methods needed for integrating Convex with Better Auth,
// as well as helper methods for general use.
export const authComponent = createClient<DataModel>(components.betterAuth, {
  authFunctions,
  triggers: {
    user: {
      onCreate: async (ctx, authUser) => {
        // Create the app user row with defaults. Identity fields live on the
        // Better Auth user record, not here.
        await ctx.db.insert("users", {
          authId: authUser._id,
          createdAt: Date.now(),
          updatedAt: Date.now(),
        })
      },
      onDelete: async (ctx, authUser) => {
        const user = await getUserByAuthId(ctx, authUser._id)
        if (!user) return
        // Free the avatar blob before dropping the row so we don't leak storage.
        if (user.avatar) await ctx.storage.delete(user.avatar)
        await ctx.db.delete(user._id)
      },
    },
  },
})

// Export trigger handlers - these become available at internal.auth
export const { onCreate, onDelete } = authComponent.triggersApi()

// Export client API for AuthBoundary and other client-side auth checks
export const { getAuthUser } = authComponent.clientApi()

export const createAuthOptions = (ctx: GenericCtx<DataModel>) =>
  ({
    baseURL: getSiteUrl(),
    database: authComponent.adapter(ctx),
    emailAndPassword: {
      enabled: true,
      // Require a verified email before password sign-in is allowed.
      // Verification uses the emailOTP plugin below (overrideDefaultEmailVerification).
      requireEmailVerification: true,
    },
    emailVerification: {
      // When `emailOtp.verifyEmail` (or the link-based verify endpoint)
      // succeeds, Better Auth creates a session and sets the cookie inline
      // instead of returning { token: null } and forcing the user to sign in
      // manually. Verified in packages/better-auth/src/plugins/email-otp/routes.ts:520
      // in the local Better Auth source — the flag is read by the emailOTP
      // plugin even though it lives on the top-level emailVerification config.
      autoSignInAfterVerification: true,
    },
    session: {
      expiresIn: 60 * 60 * 24 * 7, // 7 days
      updateAge: 60 * 60 * 24, // refresh session when 1 day remains
      freshAge: 60 * 10, // 10 minutes - fresh sessions required for sensitive ops
      cookieCache: {
        enabled: true,
        maxAge: 60 * 5, // 5 minute cache before DB revalidation
        strategy: "compact",
      },
    },
    // Better Auth handles HTTP-level rate limiting for all auth endpoints.
    // Custom rules use EXACT match unless the key contains "*" (wildcard).
    // Paths here are the post-basePath form (Better Auth strips /api/auth).
    // This app uses the email-OTP flow exclusively, so password reset and
    // verification hit /email-otp/* rather than the link-based endpoints.
    rateLimit: {
      enabled: true,
      window: 60,
      max: 100,
      customRules: {
        "/sign-in/*": { window: 60, max: 5 },
        "/sign-up/*": { window: 60, max: 3 },
        "/email-otp/request-password-reset": { window: 3600, max: 3 },
        "/email-otp/reset-password": { window: 60, max: 3 },
        "/email-otp/send-verification-otp": { window: 60, max: 3 },
        "/list-sessions": { window: 60, max: 30 },
        "/get-session": { window: 60, max: 60 },
      },
    },
    advanced: {
      ipAddress: {
        ipAddressHeaders: ["x-forwarded-for", "x-real-ip"],
      },
    },
    plugins: [
      convex({ authConfig }),
      // Email OTP for sign-in, verification, password reset, and change-email.
      emailOTP({
        overrideDefaultEmailVerification: true,
        sendVerificationOnSignUp: true,
        changeEmail: {
          enabled: true,
          verifyCurrentEmail: true,
        },
        sendVerificationOTP: async ({ email, otp, type }) => {
          await sendAuthOTP(ctx, { email, otp, type })
        },
      }),
      username({
        minUsernameLength: USERNAME_MIN_LENGTH,
        maxUsernameLength: USERNAME_MAX_LENGTH,
        validationOrder: { username: "post-normalization" },
        usernameValidator: (normalized) => {
          if (isReservedUsername(normalized)) return false
          return USERNAME_FORMAT_REGEX.test(normalized)
        },
      }),
    ],
  }) satisfies BetterAuthOptions

export const createAuth = (ctx: GenericCtx<DataModel>) => betterAuth(createAuthOptions(ctx))

/**
 * Safely get the current authenticated user. Returns undefined if not
 * authenticated or if the app user row is missing (shouldn't happen in
 * practice, but we handle it gracefully).
 */
export async function safeGetAuthenticatedUser(
  ctx: QueryCtx | MutationCtx,
): Promise<AuthUser | undefined> {
  const authUser = await authComponent.safeGetAuthUser(ctx)
  if (!authUser) return undefined

  const user = await getUserByAuthId(ctx, authUser._id)
  if (!user) return undefined

  // Resolve avatar: user upload takes precedence over Better Auth image.
  // Narrow `user.avatar` directly so getUrl sees the non-undefined branch.
  const hasUploadedAvatar = !!user.avatar
  const avatarUrl = user.avatar ? await ctx.storage.getUrl(user.avatar) : (authUser.image ?? null)

  return {
    ...user,
    authUserId: authUser._id,
    email: authUser.email,
    name: authUser.name,
    emailVerified: authUser.emailVerified,
    image: authUser.image ?? null,
    username: (authUser as { username?: string | null }).username ?? null,
    displayUsername: (authUser as { displayUsername?: string | null }).displayUsername ?? null,
    avatarUrl,
    hasUploadedAvatar,
  }
}

/**
 * Get the current authenticated user, throwing if not authenticated.
 */
export async function requireAuthenticatedUser(ctx: QueryCtx | MutationCtx): Promise<AuthUser> {
  const user = await safeGetAuthenticatedUser(ctx)
  if (!user) {
    throw authenticationRequired()
  }
  return user
}

/**
 * Validator for AuthUser return type.
 */
export const authUserValidator = v.object({
  _id: v.id("users"),
  _creationTime: v.number(),
  authId: v.string(),
  bio: v.optional(v.string()),
  avatar: v.optional(v.id("_storage")),
  createdAt: v.number(),
  updatedAt: v.number(),
  authUserId: v.string(),
  email: v.string(),
  name: v.string(),
  emailVerified: v.boolean(),
  image: v.union(v.string(), v.null()),
  username: v.union(v.string(), v.null()),
  displayUsername: v.union(v.string(), v.null()),
  avatarUrl: v.union(v.string(), v.null()),
  hasUploadedAvatar: v.boolean(),
})

// ============================================================================
// Queries
// ============================================================================
// These use the raw `query` builder because this file IS the auth primitive
// that functions.ts depends on. Importing wrappers from ./functions would
// create a circular dependency.

/**
 * Get the current authenticated user.
 * Returns null if not authenticated.
 */
export const getCurrentUser = query({
  args: {},
  returns: v.union(authUserValidator, v.null()),
  handler: async (ctx) => {
    return (await safeGetAuthenticatedUser(ctx)) ?? null
  },
})

/**
 * Check if the current user has a password-based account.
 * Useful for detecting social-only accounts that need password setup for 2FA.
 * Returns false if not authenticated.
 */
export const hasPassword = query({
  args: {},
  returns: v.boolean(),
  handler: async (ctx) => {
    const user = await safeGetAuthenticatedUser(ctx)
    if (!user) return false
    const { auth, headers } = await authComponent.getAuth(createAuth, ctx)
    const accounts = await auth.api.listUserAccounts({ headers })
    return accounts.some((account) => account.providerId === "credential")
  },
})

/**
 * Rotate JWKS keys for JWT signing.
 * Call this to migrate from EdDSA to RS256 algorithm.
 * Run with: npx convex run auth:rotateKeys
 */
export const rotateKeys = internalAction({
  args: {},
  handler: async (ctx) => {
    const auth = createAuth(ctx)
    return auth.api.rotateKeys()
  },
})
