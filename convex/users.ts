/**
 * User Queries and Mutations
 *
 * CRUD operations for the users table.
 * Uses auth wrappers from functions.ts for authentication.
 * Uses consolidated validators from validators.ts.
 */

import { v } from "convex/values";

import { query } from "./_generated/server";
import { authMutation, authQuery, optionalAuthQuery } from "./functions";
import { userUpdateFields } from "./schema";
import { getOrThrow } from "./helpers";
import { validationError } from "./errors";
import { rateLimitWithThrow } from "./rateLimit";
import {
  combineNames,
  fullUserValidator,
  paginatedUsersValidator,
  publicUserProfileValidator,
  validateBio,
  validateFirstName,
  validateLastName,
} from "./validators";
import { authComponent, createAuth } from "./auth";
import type { MutationCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";

// ============================================================================
// Return Type Definitions
// ============================================================================

/** Public user profile (no sensitive data) */
type PublicUserProfile = {
  _id: Id<"users">;
  _creationTime: number;
  firstName?: string;
  lastName?: string;
  fullName?: string;
  avatar?: string | null;
  bio?: string;
  email?: string; // Only included for own profile
};

// ============================================================================
// Validation Helpers
// ============================================================================

/**
 * Validate and sanitize profile update fields.
 * Throws validation errors for invalid input.
 * Uses centralized validation functions from validators.ts.
 */
function validateProfileUpdate(args: { firstName?: string; lastName?: string; bio?: string }) {
  if (args.firstName !== undefined) {
    const result = validateFirstName(args.firstName);
    if (!result.valid) {
      throw validationError(result.error!, "firstName");
    }
  }

  if (args.lastName !== undefined) {
    const result = validateLastName(args.lastName);
    if (!result.valid) {
      throw validationError(result.error!, "lastName");
    }
  }

  if (args.bio !== undefined) {
    const result = validateBio(args.bio);
    if (!result.valid) {
      throw validationError(result.error!, "bio");
    }
  }
}

// ============================================================================
// Queries
// ============================================================================

/**
 * Get the current authenticated user's profile with resolved avatar URL.
 * Avatar URL is already resolved in ctx.user (user upload or auth provider fallback).
 * Throws if not authenticated.
 *
 * @example
 * const me = useQuery(api.users.getMe);
 */
export const getMe = authQuery({
  args: {},
  handler: async (ctx) => {
    // ctx.user already has avatarUrl resolved (from safeGetAuthenticatedUser)
    return ctx.user;
  },
});

/**
 * Get a user by ID with resolved avatar URL.
 * Returns null if user not found.
 * Works for both authenticated and anonymous users.
 * Note: For other users, only uploaded avatar is available (no auth provider fallback).
 *
 * @example
 * const user = useQuery(api.users.getUser, { userId: "..." });
 */
export const getUser = optionalAuthQuery({
  args: { userId: v.id("users") },
  returns: v.union(publicUserProfileValidator, v.null()),
  handler: async (ctx, args): Promise<PublicUserProfile | null> => {
    const user = await ctx.db.get(args.userId);
    if (!user) {
      return null;
    }

    // Resolve avatar URL from storage ID
    const avatar = user.avatar ? await ctx.storage.getUrl(user.avatar) : null;

    // Return public profile data
    const isOwnProfile = ctx.user?._id === args.userId;

    return {
      _id: user._id,
      _creationTime: user._creationTime,
      firstName: user.firstName,
      lastName: user.lastName,
      fullName: combineNames(user.firstName, user.lastName) || undefined,
      avatar,
      bio: user.bio,
      // Only include email if viewing own profile
      ...(isOwnProfile && { email: user.email }),
    };
  },
});

/**
 * Get a user by ID, throws if not found.
 * Uses the getOrThrow helper from convex-helpers.
 *
 * @example
 * const user = useQuery(api.users.getUserOrThrow, { userId: "..." });
 */
export const getUserOrThrow = query({
  args: { userId: v.id("users") },
  returns: fullUserValidator,
  handler: async (ctx, args): Promise<Doc<"users">> => {
    return await getOrThrow(ctx, args.userId);
  },
});

/**
 * List all users (paginated) with resolved avatar URLs.
 * Public endpoint - returns limited profile data.
 *
 * @example
 * const { page, continueCursor } = useQuery(api.users.listUsers, { cursor: null, limit: 10 });
 */
export const listUsers = query({
  args: {
    cursor: v.optional(v.string()),
    limit: v.optional(v.number()),
  },
  returns: paginatedUsersValidator,
  handler: async (ctx, args) => {
    // Validate and clamp limit
    const limit = Math.min(Math.max(args.limit ?? 20, 1), 100);

    const results = await ctx.db
      .query("users")
      .order("desc")
      .paginate({ cursor: args.cursor ?? null, numItems: limit });

    // Resolve avatar URLs for all users
    const page = await Promise.all(
      results.page.map(async (user) => ({
        _id: user._id,
        _creationTime: user._creationTime,
        firstName: user.firstName,
        lastName: user.lastName,
        fullName: combineNames(user.firstName, user.lastName) || undefined,
        avatar: user.avatar ? await ctx.storage.getUrl(user.avatar) : null,
        bio: user.bio,
      })),
    );

    return {
      page,
      continueCursor: results.continueCursor,
      isDone: results.isDone,
    };
  },
});

// ============================================================================
// Mutations
// ============================================================================

/**
 * Sync name to Better Auth user table.
 * Helper function to keep Better Auth user.name in sync with app user firstName/lastName.
 */
async function syncNameToBetterAuth(
  ctx: MutationCtx,
  user: Doc<"users">,
  firstName?: string,
  lastName?: string,
): Promise<boolean> {
  // Compute the new full name using updated values or existing user values
  const newFirstName = firstName !== undefined ? firstName : user.firstName;
  const newLastName = lastName !== undefined ? lastName : user.lastName;
  const fullName = combineNames(newFirstName, newLastName);

  try {
    const { auth, headers } = await authComponent.getAuth(createAuth, ctx);
    await auth.api.updateUser({
      body: { name: fullName || "" },
      headers,
    });
    return true;
  } catch (error) {
    console.error("Failed to sync name to Better Auth:", error);
    return false;
  }
}

/**
 * Update the current user's profile.
 * Only allows updating own profile.
 * Rate limited to prevent spam.
 * Syncs name changes to Better Auth user table.
 *
 * @example
 * const updateProfile = useMutation(api.users.updateProfile);
 * await updateProfile({ name: "New Name", bio: "New bio" });
 */
export const updateProfile = authMutation({
  args: userUpdateFields,
  returns: v.id("users"),
  handler: async (ctx, args): Promise<Id<"users">> => {
    // Rate limit profile updates
    await rateLimitWithThrow(ctx, "userAction", ctx.user._id.toString());

    // Filter out undefined values and email/role (can't update those here)
    const { email: _email, role: _role, ...updates } = args;

    // Validate input
    validateProfileUpdate(updates);

    const filteredUpdates: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(updates)) {
      filteredUpdates[key] = value;
    }

    if (Object.keys(filteredUpdates).length === 0) {
      return ctx.user._id;
    }

    // Sanitize firstName/lastName if provided
    if (typeof filteredUpdates.firstName === "string") {
      filteredUpdates.firstName = filteredUpdates.firstName.trim();
    }
    if (typeof filteredUpdates.lastName === "string") {
      filteredUpdates.lastName = filteredUpdates.lastName.trim();
    }

    await ctx.db.patch(ctx.user._id, {
      ...filteredUpdates,
      updatedAt: Date.now(),
    });

    // Sync name to Better Auth if firstName or lastName was updated
    if (filteredUpdates.firstName !== undefined || filteredUpdates.lastName !== undefined) {
      await syncNameToBetterAuth(
        ctx,
        ctx.user,
        filteredUpdates.firstName as string | undefined,
        filteredUpdates.lastName as string | undefined,
      );
    }

    return ctx.user._id;
  },
});

/**
 * Update a specific field on the current user's profile.
 * Convenience mutation for updating a single field.
 * Rate limited to prevent spam.
 * Note: For avatar updates, use updateAvatar/deleteAvatar mutations instead.
 *
 * @example
 * const updateField = useMutation(api.users.updateProfileField);
 * await updateField({ field: "firstName", value: "John" });
 */
export const updateProfileField = authMutation({
  args: {
    field: v.union(v.literal("firstName"), v.literal("lastName"), v.literal("bio")),
    value: v.union(v.string(), v.null()),
  },
  returns: v.id("users"),
  handler: async (ctx, args): Promise<Id<"users">> => {
    // Rate limit field updates
    await rateLimitWithThrow(ctx, "userAction", ctx.user._id.toString());

    // Validate input based on field
    if (args.field === "firstName") {
      validateProfileUpdate({ firstName: args.value ?? undefined });
    } else if (args.field === "lastName") {
      validateProfileUpdate({ lastName: args.value ?? undefined });
    } else {
      validateProfileUpdate({ bio: args.value ?? undefined });
    }

    // Sanitize value
    let sanitizedValue = args.value;
    if ((args.field === "firstName" || args.field === "lastName") && sanitizedValue) {
      sanitizedValue = sanitizedValue.trim();
    }

    await ctx.db.patch(ctx.user._id, {
      [args.field]: sanitizedValue,
      updatedAt: Date.now(),
    });

    return ctx.user._id;
  },
});

/**
 * Generate an upload URL for avatar images.
 * The URL expires in 1 hour.
 *
 * @example
 * const generateUploadUrl = useMutation(api.users.generateAvatarUploadUrl);
 * const uploadUrl = await generateUploadUrl();
 */
export const generateAvatarUploadUrl = authMutation({
  args: {},
  handler: async (ctx) => {
    return await ctx.storage.generateUploadUrl();
  },
});

/**
 * Result type for avatar update operation.
 */
type AvatarUpdateResult = {
  avatarUrl: string | null;
  syncedToBetterAuth: boolean;
};

/**
 * Update the current user's avatar with a storage ID.
 * Deletes the old avatar file from storage if one exists.
 * This overrides any auth provider avatar.
 * Returns the URL of the uploaded image and sync status.
 *
 * @example
 * const updateAvatar = useMutation(api.users.updateAvatar);
 * const { avatarUrl, syncedToBetterAuth } = await updateAvatar({ storageId: "..." });
 */
export const updateAvatar = authMutation({
  args: { storageId: v.id("_storage") },
  returns: v.object({
    avatarUrl: v.union(v.string(), v.null()),
    syncedToBetterAuth: v.boolean(),
  }),
  handler: async (ctx, args): Promise<AvatarUpdateResult> => {
    // Rate limit avatar updates
    await rateLimitWithThrow(ctx, "userAction", ctx.user._id.toString());

    // Delete old avatar from storage if exists
    if (ctx.user.avatar) {
      await ctx.storage.delete(ctx.user.avatar);
    }

    // Update the user's avatar storage ID
    await ctx.db.patch(ctx.user._id, {
      avatar: args.storageId,
      updatedAt: Date.now(),
    });

    // Get the URL for the new avatar
    const avatarUrl = await ctx.storage.getUrl(args.storageId);

    // Sync avatar URL to Better Auth user table
    let syncedToBetterAuth = false;
    if (avatarUrl) {
      try {
        const { auth, headers } = await authComponent.getAuth(createAuth, ctx);
        await auth.api.updateUser({
          body: { image: avatarUrl },
          headers,
        });
        syncedToBetterAuth = true;
      } catch (error) {
        // Log but don't fail - app user avatar is already updated
        console.error("Failed to sync avatar to Better Auth:", error);
      }
    }

    return { avatarUrl, syncedToBetterAuth };
  },
});

/**
 * Clear the current user's custom name.
 * After clearing, auth provider name (if any) will be used as fallback.
 * Uses null to clear fields (consistent with avatar handling).
 * Syncs the cleared name to Better Auth user table.
 *
 * @example
 * const clearName = useMutation(api.users.clearName);
 * await clearName();
 */
export const clearName = authMutation({
  args: {},
  returns: v.object({ success: v.boolean(), syncedToBetterAuth: v.boolean() }),
  handler: async (ctx): Promise<{ success: boolean; syncedToBetterAuth: boolean }> => {
    // Rate limit name clearing
    await rateLimitWithThrow(ctx, "userAction", ctx.user._id.toString());

    // Clear the name fields using undefined to remove them from the document
    // This makes them fall back to auth provider name
    // Note: We use undefined here because firstName/lastName are v.optional(v.string())
    // not nullable - so undefined removes the field, allowing fallback behavior
    await ctx.db.patch(ctx.user._id, {
      firstName: undefined,
      lastName: undefined,
      updatedAt: Date.now(),
    });

    // Clear name in Better Auth user table
    let syncedToBetterAuth = false;
    try {
      const { auth, headers } = await authComponent.getAuth(createAuth, ctx);
      await auth.api.updateUser({
        body: { name: "" },
        headers,
      });
      syncedToBetterAuth = true;
    } catch (error) {
      console.error("Failed to clear name in Better Auth:", error);
    }

    return { success: true, syncedToBetterAuth };
  },
});

/**
 * Delete the current user's uploaded avatar.
 * Removes the file from storage and clears the avatar field.
 * After deletion, auth provider avatar (if any) will be used as fallback.
 *
 * @example
 * const deleteAvatar = useMutation(api.users.deleteAvatar);
 * const { success, syncedToBetterAuth } = await deleteAvatar();
 */
export const deleteAvatar = authMutation({
  args: {},
  returns: v.object({ success: v.boolean(), syncedToBetterAuth: v.boolean() }),
  handler: async (ctx): Promise<{ success: boolean; syncedToBetterAuth: boolean }> => {
    // Rate limit avatar deletion
    await rateLimitWithThrow(ctx, "userAction", ctx.user._id.toString());

    // Delete avatar from storage if exists
    if (ctx.user.avatar) {
      await ctx.storage.delete(ctx.user.avatar);
    }

    // Clear the avatar storage ID (will fall back to auth provider avatar)
    await ctx.db.patch(ctx.user._id, {
      avatar: null,
      updatedAt: Date.now(),
    });

    // Clear avatar URL in Better Auth user table
    let syncedToBetterAuth = false;
    try {
      const { auth, headers } = await authComponent.getAuth(createAuth, ctx);
      await auth.api.updateUser({
        body: { image: "" },
        headers,
      });
      syncedToBetterAuth = true;
    } catch (error) {
      // Log but don't fail - app user avatar is already cleared
      console.error("Failed to clear avatar in Better Auth:", error);
    }

    return { success: true, syncedToBetterAuth };
  },
});

/**
 * Delete the current user's account.
 * Properly deletes the Better Auth user, which cascades to delete the app user via triggers.
 *
 * @deprecated Use api.authMutations.deleteAccount instead for password confirmation support.
 *
 * @example
 * const deleteAccount = useMutation(api.users.deleteAccount);
 * await deleteAccount();
 */
export const deleteAccount = authMutation({
  args: {},
  returns: v.object({ success: v.boolean() }),
  handler: async (ctx): Promise<{ success: boolean }> => {
    // Rate limit account deletion
    await rateLimitWithThrow(ctx, "userAction", ctx.user._id.toString());

    try {
      // Delete the Better Auth user - this triggers onDelete which cleans up the app user
      const { auth, headers } = await authComponent.getAuth(createAuth, ctx);
      await auth.api.deleteUser({
        body: {}, // Empty body required by Better Auth API
        headers,
      });
      return { success: true };
    } catch (error) {
      // If Better Auth deletion fails, log but still delete app user as fallback
      console.error("Failed to delete Better Auth user:", error);
      await ctx.db.delete(ctx.user._id);
      return { success: true };
    }
  },
});
