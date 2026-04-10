/**
 * Custom Function Wrappers
 *
 * Provides authenticated query/mutation wrappers that inject
 * the current user into the context.
 *
 * Uses centralized auth functions from auth.ts to avoid duplication.
 */

import { customCtx, customMutation, customQuery } from "convex-helpers/server/customFunctions";

import { mutation, query } from "./_generated/server";
import { requireAuthenticatedUser, safeGetAuthenticatedUser } from "./auth";
import type { AuthUser } from "./auth";

// Re-export AuthUser type for convenience
export type { AuthUser };

// ============================================================================
// Query Wrappers
// ============================================================================

/**
 * Authenticated query - throws ConvexError if user is not logged in.
 *
 * @example
 * export const getMyProfile = authQuery({
 *   args: {},
 *   handler: async (ctx, args) => {
 *     // ctx.user is guaranteed to exist
 *     return ctx.user;
 *   },
 * });
 */
export const authQuery = customQuery(
  query,
  customCtx(async (ctx) => ({
    user: await requireAuthenticatedUser(ctx),
  })),
);

/**
 * Optional auth query - user may be undefined.
 * Use for endpoints that work for both authenticated and anonymous users.
 *
 * @example
 * export const getPublicProfile = optionalAuthQuery({
 *   args: { userId: v.id("users") },
 *   handler: async (ctx, args) => {
 *     const profile = await ctx.db.get(args.userId);
 *     const isOwner = ctx.user?._id === args.userId;
 *     return { ...profile, isOwner };
 *   },
 * });
 */
export const optionalAuthQuery = customQuery(
  query,
  customCtx(async (ctx) => ({
    user: await safeGetAuthenticatedUser(ctx),
  })),
);

// ============================================================================
// Mutation Wrappers
// ============================================================================

/**
 * Authenticated mutation - throws ConvexError if user is not logged in.
 *
 * @example
 * export const updateBio = authMutation({
 *   args: { bio: v.string() },
 *   handler: async (ctx, args) => {
 *     await ctx.db.patch(ctx.user._id, { bio: args.bio });
 *   },
 * });
 */
export const authMutation = customMutation(
  mutation,
  customCtx(async (ctx) => ({
    user: await requireAuthenticatedUser(ctx),
  })),
);
