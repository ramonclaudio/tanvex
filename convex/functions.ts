/**
 * Custom Function Wrappers
 *
 * Provides authenticated query/mutation/action wrappers that inject
 * the current user into the context.
 *
 * Uses centralized auth functions from auth.ts to avoid duplication.
 * Includes onSuccess callbacks for logging and analytics.
 */

import {
  customAction,
  customCtx,
  customMutation,
  customQuery,
} from "convex-helpers/server/customFunctions";

import { action, mutation, query } from "./_generated/server";
import { authComponent, requireAuthenticatedUser, safeGetAuthenticatedUser } from "./auth";
import { authenticationRequired } from "./errors";
import type { ActionCtx } from "./_generated/server";
import type { AuthUser } from "./auth";

// Re-export AuthUser type for convenience
export type { AuthUser };

// ============================================================================
// Action Auth Helpers (actions don't have db access)
// ============================================================================

/**
 * Get auth user info for actions (no db access, just auth info).
 * Returns undefined if not authenticated.
 */
async function getAuthUserForAction(
  ctx: ActionCtx,
): Promise<{ authUserId: string; email: string; name: string | null } | undefined> {
  const authUser = await authComponent.safeGetAuthUser(ctx);
  if (!authUser) {
    return undefined;
  }

  return {
    authUserId: authUser._id,
    email: authUser.email,
    name: authUser.name,
  };
}

/**
 * Require auth user for actions, throwing if not authenticated.
 */
async function requireAuthForAction(
  ctx: ActionCtx,
): Promise<{ authUserId: string; email: string; name: string | null }> {
  const user = await getAuthUserForAction(ctx);
  if (!user) {
    throw authenticationRequired();
  }
  return user;
}

// ============================================================================
// Query Wrappers
// ============================================================================

/**
 * Authenticated query - throws ConvexError if user is not logged in.
 * Use this for endpoints that require authentication.
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
 * Use this for endpoints that work for both authenticated and anonymous users.
 *
 * @example
 * export const getPublicProfile = optionalAuthQuery({
 *   args: { userId: v.id("users") },
 *   handler: async (ctx, args) => {
 *     const profile = await ctx.db.get(args.userId);
 *     // ctx.user may be undefined
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
 * Use this for mutations that require authentication.
 *
 * @example
 * export const updateProfile = authMutation({
 *   args: { name: v.string() },
 *   handler: async (ctx, args) => {
 *     await ctx.db.patch(ctx.user._id, { name: args.name });
 *   },
 * });
 */
export const authMutation = customMutation(
  mutation,
  customCtx(async (ctx) => ({
    user: await requireAuthenticatedUser(ctx),
  })),
);

/**
 * Optional auth mutation - user may be undefined.
 * Use this for mutations that work for both authenticated and anonymous users.
 */
export const optionalAuthMutation = customMutation(
  mutation,
  customCtx(async (ctx) => ({
    user: await safeGetAuthenticatedUser(ctx),
  })),
);

// ============================================================================
// Action Wrappers
// ============================================================================

/**
 * Authenticated action - throws ConvexError if user is not logged in.
 * Use this for actions that require authentication.
 *
 * Note: Actions don't have direct db access, so ctx.user only contains
 * auth info (authUserId, email, name), not the full user document.
 * Use ctx.runQuery to fetch additional user data if needed.
 */
export const authAction = customAction(
  action,
  customCtx(async (ctx) => ({
    user: await requireAuthForAction(ctx),
  })),
);

/**
 * Optional auth action - user may be undefined.
 * Use this for actions that work for both authenticated and anonymous users.
 */
export const optionalAuthAction = customAction(
  action,
  customCtx(async (ctx) => ({
    user: await getAuthUserForAction(ctx),
  })),
);
