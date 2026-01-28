import { createClient } from "@convex-dev/better-auth";
import { convex } from "@convex-dev/better-auth/plugins";
import { betterAuth } from "better-auth";
import { username } from "better-auth/plugins";
import { withoutSystemFields } from "convex-helpers";

import { v } from "convex/values";
import { components, internal } from "./_generated/api";
import authConfig from "./auth.config";
import { internalAction, query } from "./_generated/server";
import { authenticationRequired } from "./errors";

// ============================================================================
// Auth User Validator (for return types)
// ============================================================================

import { roleValidator } from "./schema";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import type { DataModel, Doc, Id } from "./_generated/dataModel";
import type { BetterAuthOptions } from "better-auth";
import type { AuthFunctions, GenericCtx } from "@convex-dev/better-auth";

// ============================================================================
// Name Parsing Utilities
// ============================================================================

/**
 * Parse a full name string into firstName and lastName.
 * Better Auth stores a single "name" field, so we parse it.
 */
function parseFullName(name: string | null | undefined): {
  firstName: string | undefined;
  lastName: string | undefined;
} {
  if (!name || name.trim() === "") {
    return { firstName: undefined, lastName: undefined };
  }

  const trimmed = name.trim();
  const parts = trimmed.split(/\s+/);

  if (parts.length === 1) {
    return { firstName: parts[0], lastName: undefined };
  }

  // First part is firstName, rest joined as lastName
  const [firstName, ...rest] = parts;
  return { firstName, lastName: rest.join(" ") };
}

/**
 * Combine firstName and lastName into a full name string.
 */
export function combineNames(
  firstName: string | undefined | null,
  lastName: string | undefined | null,
): string {
  const parts = [firstName, lastName].filter(Boolean);
  return parts.join(" ");
}

/**
 * Get the site URL from environment.
 * Logs a warning and returns undefined if not set, allowing Better Auth to handle it.
 * This allows the module to be loaded even if the env var is missing (e.g., during codegen).
 */
function getSiteUrl(): string | undefined {
  const url = process.env.SITE_URL;
  if (!url) {
    // Log warning but don't throw - Better Auth will handle missing baseURL
    // This is more graceful than throwing at runtime
    console.warn(
      "[Auth] SITE_URL environment variable is not set. " +
        "This is required for auth redirects to work correctly. " +
        "Set it in your Convex dashboard or .env.local file.",
    );
    return undefined;
  }
  return url;
}

const authFunctions: AuthFunctions = internal.auth;

// ============================================================================
// Type Guards and Type Definitions
// ============================================================================

/**
 * Type for Better Auth user with username plugin fields.
 * This provides proper typing for the username plugin extension.
 */
type BetterAuthUserWithUsername = {
  _id: string;
  email: string;
  name: string | null;
  image: string | null;
  username?: string | null;
  displayUsername?: string | null;
};

/**
 * Type guard to check if a Better Auth user has username fields.
 */
function hasUsernameFields(user: unknown): user is BetterAuthUserWithUsername {
  return typeof user === "object" && user !== null && "_id" in user && "email" in user;
}

/**
 * Type guard to check if a value is a valid Convex ID format.
 */
export function isValidConvexId(id: unknown): boolean {
  return typeof id === "string" && id.length > 0;
}

/**
 * Type guard specifically for users table IDs.
 * Note: This validates format only; actual existence requires DB lookup.
 */
export function isValidUserId(userId: unknown): userId is Id<"users"> {
  return typeof userId === "string" && userId.length > 0;
}

// ============================================================================
// User Lookup by AuthId (indexed, efficient)
// ============================================================================

/**
 * Get user by Better Auth ID using the indexed lookup.
 * This is the efficient way to find app users from Better Auth users.
 */
export async function getUserByAuthId(
  ctx: QueryCtx | MutationCtx,
  authId: string,
): Promise<Doc<"users"> | null> {
  return await ctx.db
    .query("users")
    .withIndex("authId", (q) => q.eq("authId", authId))
    .unique();
}

// ============================================================================
// Auth User Type
// ============================================================================

/**
 * Type for the authenticated user context.
 * Combines application user data with auth metadata.
 * Names and avatar follow the same pattern: user-set values take precedence over auth provider.
 */
export type AuthUser = Doc<"users"> & {
  authUserId: string;
  email: string;
  // Username from Better Auth
  username: string | null | undefined;
  displayUsername: string | null | undefined;
  // Resolved names: user-set values take precedence over auth provider
  firstName: string | undefined;
  lastName: string | undefined;
  fullName: string; // Computed from resolved firstName + lastName
  // Flags to indicate if user has set their own values (can be cleared to revert to provider)
  hasCustomName: boolean; // True if user has set firstName or lastName
  emailVerified: boolean;
  image: string | null | undefined;
  avatarUrl: string | null; // Resolved URL: user upload takes precedence over auth provider image
  hasUploadedAvatar: boolean; // True if user has uploaded their own avatar (can be deleted)
  // From Better Auth user table (via withoutSystemFields spread)
  name: string | null | undefined;
};

// The component client has methods needed for integrating Convex with Better Auth,
// as well as helper methods for general use.
export const authComponent = createClient<DataModel>(components.betterAuth, {
  authFunctions,
  triggers: {
    user: {
      onCreate: async (ctx, authUser) => {
        // Create application user when Better Auth user is created
        // Store authId for efficient indexed lookups (no setUserId needed)
        // Parse the name from Better Auth into firstName/lastName
        const { firstName, lastName } = parseFullName(authUser.name);

        // Safely extract username fields using type guard
        const username = hasUsernameFields(authUser) ? authUser.username : undefined;
        const displayUsername = hasUsernameFields(authUser) ? authUser.displayUsername : undefined;

        await ctx.db.insert("users", {
          authId: authUser._id, // Store the Better Auth user ID for indexed lookup
          email: authUser.email,
          username: username ?? undefined,
          displayUsername: displayUsername ?? undefined,
          firstName,
          lastName,
          role: "user", // Default role for new users
          createdAt: Date.now(),
          updatedAt: Date.now(),
        });
      },
      onUpdate: async (ctx, newUser, oldUser) => {
        // Sync changes from Better Auth user to application user
        // This keeps the app's users table in sync with Better Auth

        // Safely extract username fields using type guard
        const newUsername = hasUsernameFields(newUser) ? newUser.username : undefined;
        const oldUsername = hasUsernameFields(oldUser) ? oldUser.username : undefined;
        const newDisplayUsername = hasUsernameFields(newUser) ? newUser.displayUsername : undefined;
        const oldDisplayUsername = hasUsernameFields(oldUser) ? oldUser.displayUsername : undefined;

        const emailChanged = oldUser.email !== newUser.email;
        const nameChanged = oldUser.name !== newUser.name;
        const usernameChanged = oldUsername !== newUsername;
        const displayUsernameChanged = oldDisplayUsername !== newDisplayUsername;

        if (!emailChanged && !nameChanged && !usernameChanged && !displayUsernameChanged) {
          return;
        }

        // Use authId index for efficient lookup
        const user = await ctx.db
          .query("users")
          .withIndex("authId", (q) => q.eq("authId", newUser._id))
          .unique();

        if (user) {
          // Build update object
          const updates: Record<string, unknown> = { updatedAt: Date.now() };

          if (emailChanged) {
            updates.email = newUser.email;
          }

          if (nameChanged) {
            const { firstName, lastName } = parseFullName(newUser.name);
            updates.firstName = firstName;
            updates.lastName = lastName;
          }

          if (usernameChanged) {
            updates.username = newUsername ?? undefined;
          }

          if (displayUsernameChanged) {
            updates.displayUsername = newDisplayUsername ?? undefined;
          }

          await ctx.db.patch(user._id, updates);
        }
      },
      onDelete: async (ctx, authUser) => {
        // Delete application user when Better Auth user is deleted
        // Use authId index for efficient lookup
        const user = await ctx.db
          .query("users")
          .withIndex("authId", (q) => q.eq("authId", authUser._id))
          .unique();

        if (user) {
          await ctx.db.delete(user._id);
        }
      },
    },
  },
});

// Export trigger handlers - these become available at internal.auth
export const { onCreate, onUpdate, onDelete } = authComponent.triggersApi();

// Export client API for AuthBoundary and other client-side auth checks
export const { getAuthUser } = authComponent.clientApi();

export const createAuthOptions = (ctx: GenericCtx<DataModel>) =>
  ({
    baseURL: getSiteUrl(),
    database: authComponent.adapter(ctx),
    // Configure simple, non-verified email/password to get started
    emailAndPassword: {
      enabled: true,
      requireEmailVerification: false,
    },
    // ========================================================================
    // Session Configuration
    // ========================================================================
    // Explicit session settings for security and performance.
    // These values are Better Auth defaults, but we set them explicitly
    // for clarity and to document our security decisions.
    session: {
      // Session expires after 7 days of inactivity
      expiresIn: 60 * 60 * 24 * 7, // 7 days in seconds
      // Session expiration is refreshed when 1 day remains
      // (i.e., session is used and more than 1 day has passed since last refresh)
      updateAge: 60 * 60 * 24, // 1 day in seconds
      // Session is considered "fresh" for 10 minutes after creation
      // Fresh sessions are required for sensitive operations
      freshAge: 60 * 10, // 10 minutes in seconds (stricter than default 1 day)
      // Cookie cache reduces database calls for session validation
      // The session is cached in a signed cookie for fast validation
      cookieCache: {
        enabled: true,
        maxAge: 60 * 5, // 5 minutes - cache duration before DB revalidation
        strategy: "compact", // Smallest size, good security (signed), best for internal use
      },
    },
    // ========================================================================
    // Rate Limiting Configuration
    // ========================================================================
    // Better Auth handles HTTP-level rate limiting for all auth endpoints.
    // This protects sign-in, sign-up, password reset, and other auth routes.
    // Uses the Better Auth component's rateLimit table for storage.
    rateLimit: {
      enabled: true,
      window: 60, // 60 second window (default)
      max: 100, // 100 requests per window (default)
      // Custom rules for sensitive endpoints
      customRules: {
        // Sign-in: Strict limit to prevent credential stuffing
        "/sign-in/*": {
          window: 60,
          max: 5, // 5 attempts per minute
        },
        // Sign-up: Prevent mass account creation
        "/sign-up/*": {
          window: 60,
          max: 3, // 3 sign-ups per minute
        },
        // Password reset: Prevent enumeration and spam
        "/forget-password": {
          window: 3600, // 1 hour window
          max: 3, // 3 requests per hour
        },
        "/reset-password/*": {
          window: 60,
          max: 3, // 3 attempts per minute
        },
        // Email verification: Prevent spam
        "/send-verification-email": {
          window: 60,
          max: 3,
        },
        // Session listing: More permissive for UX
        "/list-sessions": {
          window: 60,
          max: 30,
        },
        // Get session: Very permissive (called frequently by clients)
        "/get-session": {
          window: 60,
          max: 60,
        },
      },
    },
    // IP address detection for rate limiting
    // Uses x-forwarded-for header (standard for production behind proxies)
    advanced: {
      ipAddress: {
        ipAddressHeaders: ["x-forwarded-for", "x-real-ip"],
      },
    },
    plugins: [
      // The Convex plugin is required for Convex compatibility
      convex({
        authConfig,
      }),
      // Username support for sign-in/sign-up
      username({
        // Minimum username length (default is 3)
        minUsernameLength: 3,
        // Maximum username length (default is 30)
        maxUsernameLength: 30,
        // Validate after normalization so we check the lowercase version
        validationOrder: {
          username: "post-normalization",
        },
        // Custom validator to block reserved usernames
        // This runs AFTER normalization, so username is already lowercase
        usernameValidator: (username) => {
          const reserved = [
            "admin",
            "administrator",
            "root",
            "system",
            "moderator",
            "mod",
            "support",
            "help",
            "info",
            "contact",
            "api",
            "www",
            "mail",
            "email",
            "test",
            "null",
            "undefined",
          ];
          // Block reserved usernames (already normalized to lowercase)
          if (reserved.includes(username)) {
            return false;
          }
          // Only allow alphanumeric, underscores, and dots
          return /^[a-zA-Z0-9_.]+$/.test(username);
        },
      }),
    ],
  }) satisfies BetterAuthOptions;

export const createAuth = (ctx: GenericCtx<DataModel>) => betterAuth(createAuthOptions(ctx));

// ============================================================================
// Centralized User Fetching (single source of truth)
// ============================================================================

/**
 * Safely get the current authenticated user.
 * Returns undefined if not authenticated or user not found.
 * Includes resolved avatar URL - user upload takes precedence over auth provider image.
 *
 * This is the single source of truth for user fetching.
 * Use this in custom function wrappers and other modules.
 */
export async function safeGetAuthenticatedUser(
  ctx: QueryCtx | MutationCtx,
): Promise<AuthUser | undefined> {
  const authUser = await authComponent.safeGetAuthUser(ctx);
  if (!authUser) {
    return undefined;
  }

  // Use efficient authId index lookup
  const user = await getUserByAuthId(ctx, authUser._id);
  if (!user) {
    return undefined;
  }

  // Resolve avatar: user upload takes precedence over auth provider image
  const hasUploadedAvatar = !!user.avatar;
  const avatarUrl = hasUploadedAvatar
    ? await ctx.storage.getUrl(user.avatar!)
    : (authUser.image ?? null);

  // Resolve names: user-set values take precedence over auth provider
  // Parse auth provider's name as fallback
  const providerName = parseFullName(authUser.name);
  const hasCustomName = !!(user.firstName || user.lastName);

  // Use user's name if set, otherwise fall back to auth provider
  const firstName = user.firstName || providerName.firstName;
  const lastName = user.lastName || providerName.lastName;
  const fullName = combineNames(firstName, lastName);

  return {
    ...user,
    ...withoutSystemFields(authUser),
    authUserId: authUser._id,
    // Username from app user table (synced from Better Auth via triggers)
    username: user.username ?? null,
    displayUsername: user.displayUsername ?? null,
    firstName,
    lastName,
    fullName,
    hasCustomName,
    avatarUrl,
    hasUploadedAvatar,
  } as AuthUser;
}

/**
 * Get the current authenticated user, throwing if not authenticated.
 * Use this when authentication is required.
 */
export async function requireAuthenticatedUser(ctx: QueryCtx | MutationCtx): Promise<AuthUser> {
  const user = await safeGetAuthenticatedUser(ctx);
  if (!user) {
    throw authenticationRequired();
  }
  return user;
}

/**
 * Get user by ID with role information.
 * Returns null if not authenticated or user not found.
 */
export async function getUserWithRole(ctx: QueryCtx | MutationCtx) {
  const authUser = await authComponent.safeGetAuthUser(ctx);
  if (!authUser) {
    return null;
  }

  // Use efficient authId index lookup
  const user = await getUserByAuthId(ctx, authUser._id);
  if (!user) {
    return null;
  }

  return { ...user, authUser };
}

// Legacy exports for backwards compatibility
/** @deprecated Use safeGetAuthenticatedUser instead */
export const safeGetUser = safeGetAuthenticatedUser;
/** @deprecated Use requireAuthenticatedUser instead */
export const getUser = requireAuthenticatedUser;

/**
 * Validator for AuthUser return type.
 * Used for return type validation on auth-related queries.
 * Note: username and displayUsername can be string, null, or undefined
 * due to the combination of Doc<'users'> fields and auth user data.
 */
export const authUserValidator = v.object({
  _id: v.id("users"),
  _creationTime: v.number(),
  authId: v.string(),
  email: v.string(),
  username: v.optional(v.union(v.string(), v.null())),
  displayUsername: v.optional(v.union(v.string(), v.null())),
  firstName: v.optional(v.string()),
  lastName: v.optional(v.string()),
  fullName: v.string(),
  hasCustomName: v.boolean(),
  avatar: v.optional(v.union(v.id("_storage"), v.null())),
  bio: v.optional(v.string()),
  role: v.optional(roleValidator),
  createdAt: v.optional(v.number()),
  updatedAt: v.optional(v.number()),
  authUserId: v.string(),
  emailVerified: v.boolean(),
  image: v.optional(v.union(v.string(), v.null())),
  avatarUrl: v.union(v.string(), v.null()),
  hasUploadedAvatar: v.boolean(),
  // From Better Auth user table (via withoutSystemFields spread)
  name: v.optional(v.union(v.string(), v.null())),
});

// ============================================================================
// Queries
// ============================================================================

/**
 * Get the current authenticated user.
 * Returns null if not authenticated.
 */
export const getCurrentUser = query({
  args: {},
  returns: v.union(authUserValidator, v.null()),
  handler: async (ctx) => {
    return (await safeGetAuthenticatedUser(ctx)) ?? null;
  },
});

/**
 * Check if the current user has a password-based account.
 * Useful for detecting social-only accounts that need password setup for 2FA.
 */
export const hasPassword = query({
  args: {},
  returns: v.boolean(),
  handler: async (ctx) => {
    const { auth, headers } = await authComponent.getAuth(createAuth, ctx);
    const accounts = await auth.api.listUserAccounts({
      headers,
    });
    return accounts.some((account) => account.providerId === "credential");
  },
});

// ============================================================================
// Key Rotation
// ============================================================================

/**
 * Rotate JWKS keys for JWT signing.
 * Call this to migrate from EdDSA to RS256 algorithm.
 * Run with: npx convex run auth:rotateKeys
 */
export const rotateKeys = internalAction({
  args: {},
  handler: async (ctx) => {
    const auth = createAuth(ctx);
    return auth.api.rotateKeys();
  },
});
