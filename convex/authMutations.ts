/**
 * Server-Side Auth Mutations
 *
 * These mutations provide server-side access to Better Auth operations.
 * Use these for operations that need to run in trusted server context.
 *
 * Rate Limiting Strategy:
 * - HTTP-level auth operations (sign-in, sign-up, password reset) are rate limited
 *   by Better Auth at the HTTP layer (see auth.ts rateLimit config)
 * - Application-level operations (profile updates, session management) are rate
 *   limited here using the Convex rate limiter
 *
 * @see https://www.better-auth.com/docs/concepts/server-side
 */

import { v } from "convex/values";

import { mutation } from "./_generated/server";
import { authComponent, createAuth } from "./auth";
import { authMutation } from "./functions";
import { ErrorCode, createError } from "./errors";
import { rateLimitWithThrow } from "./rateLimit";

// ============================================================================
// Password Management
// ============================================================================

/**
 * Change password for authenticated user.
 * Requires current password for verification.
 * By default, revokes all other sessions for security (can be disabled).
 * Rate limited to prevent brute force attacks.
 *
 * @example
 * const changePassword = useMutation(api.authMutations.changePassword);
 * await changePassword({ currentPassword: "old", newPassword: "new" });
 * // Keep other sessions active:
 * await changePassword({ currentPassword: "old", newPassword: "new", revokeOtherSessions: false });
 */
export const changePassword = authMutation({
  args: {
    currentPassword: v.string(),
    newPassword: v.string(),
    revokeOtherSessions: v.optional(v.boolean()), // Defaults to true for security
  },
  returns: v.object({ success: v.boolean() }),
  handler: async (ctx, args): Promise<{ success: boolean }> => {
    // Rate limit password changes per user (sensitive action)
    await rateLimitWithThrow(ctx, "userAction", ctx.user._id.toString());

    try {
      const { auth, headers } = await authComponent.getAuth(createAuth, ctx);

      await auth.api.changePassword({
        body: {
          currentPassword: args.currentPassword,
          newPassword: args.newPassword,
          // Revoke other sessions by default for security
          // When password changes, other sessions should be invalidated
          revokeOtherSessions: args.revokeOtherSessions ?? true,
        },
        headers,
      });

      return { success: true };
    } catch (error) {
      if (error instanceof Error && error.message.includes("incorrect")) {
        throw createError(ErrorCode.INVALID_CREDENTIALS, "Current password is incorrect");
      }
      throw createError(ErrorCode.INTERNAL_ERROR, "Failed to change password");
    }
  },
});

/**
 * Request password reset email.
 * Can be called without authentication.
 *
 * Note: Rate limiting for password reset is handled at the HTTP layer by Better Auth
 * when clients call the /api/auth/forget-password endpoint directly.
 * This mutation exists for server-side use cases.
 *
 * @example
 * const forgotPassword = useMutation(api.authMutations.forgotPassword);
 * await forgotPassword({ email: "user@example.com" });
 */
export const forgotPassword = mutation({
  args: {
    email: v.string(),
  },
  returns: v.object({ success: v.boolean() }),
  handler: async (ctx, args): Promise<{ success: boolean }> => {
    // Note: Better Auth handles rate limiting at the HTTP layer for /forget-password
    // This internal call bypasses HTTP rate limiting, which is intentional for
    // server-side use cases. If you need rate limiting here, implement it.

    try {
      const { auth } = await authComponent.getAuth(createAuth, ctx);

      await auth.api.requestPasswordReset({
        body: {
          email: args.email,
          redirectTo: `${process.env.SITE_URL}/auth/reset-password`,
        },
      });

      // Always return success to prevent email enumeration
      return { success: true };
    } catch {
      // Don't reveal if email exists
      return { success: true };
    }
  },
});

/**
 * Reset password with token from email.
 *
 * Note: Rate limiting for password reset is handled at the HTTP layer by Better Auth
 * when clients call the /api/auth/reset-password endpoint directly.
 * This mutation exists for server-side use cases.
 *
 * @example
 * const resetPassword = useMutation(api.authMutations.resetPassword);
 * await resetPassword({ token: "...", newPassword: "newpass" });
 */
export const resetPassword = mutation({
  args: {
    token: v.string(),
    newPassword: v.string(),
  },
  returns: v.object({ success: v.boolean() }),
  handler: async (ctx, args): Promise<{ success: boolean }> => {
    // Note: Better Auth handles rate limiting at the HTTP layer for /reset-password
    // Token validation and expiry is handled by Better Auth itself

    try {
      const { auth } = await authComponent.getAuth(createAuth, ctx);

      await auth.api.resetPassword({
        body: {
          token: args.token,
          newPassword: args.newPassword,
        },
      });

      return { success: true };
    } catch (error) {
      if (error instanceof Error && error.message.includes("expired")) {
        throw createError(ErrorCode.SESSION_EXPIRED, "Reset token has expired");
      }
      throw createError(ErrorCode.INVALID_INPUT, "Invalid reset token");
    }
  },
});

// ============================================================================
// Email Management
// ============================================================================

/**
 * Update email for authenticated user.
 * May require email verification depending on config.
 * Rate limited to prevent abuse.
 *
 * @example
 * const updateEmail = useMutation(api.authMutations.updateEmail);
 * await updateEmail({ newEmail: "new@example.com" });
 */
export const updateEmail = authMutation({
  args: {
    newEmail: v.string(),
  },
  returns: v.object({ success: v.boolean() }),
  handler: async (ctx, args): Promise<{ success: boolean }> => {
    // Rate limit email changes per user
    await rateLimitWithThrow(ctx, "userAction", ctx.user._id.toString());

    try {
      const { auth, headers } = await authComponent.getAuth(createAuth, ctx);

      await auth.api.changeEmail({
        body: {
          newEmail: args.newEmail,
        },
        headers,
      });

      return { success: true };
    } catch (error) {
      if (error instanceof Error && error.message.includes("already")) {
        throw createError(ErrorCode.ALREADY_EXISTS, "Email is already in use");
      }
      throw createError(ErrorCode.INTERNAL_ERROR, "Failed to update email");
    }
  },
});

/**
 * Resend email verification.
 *
 * Note: Rate limiting for verification emails is handled at the HTTP layer by Better Auth
 * when clients call the /api/auth/send-verification-email endpoint directly.
 * This mutation exists for server-side use cases.
 *
 * @example
 * const resendVerification = useMutation(api.authMutations.resendVerification);
 * await resendVerification();
 */
export const resendVerification = authMutation({
  args: {},
  returns: v.object({ success: v.boolean() }),
  handler: async (ctx): Promise<{ success: boolean }> => {
    // Note: Better Auth handles rate limiting at the HTTP layer for /send-verification-email

    try {
      const { auth, headers } = await authComponent.getAuth(createAuth, ctx);

      await auth.api.sendVerificationEmail({
        body: {
          email: ctx.user.email,
          callbackURL: `${process.env.SITE_URL}/auth/verify`,
        },
        headers,
      });

      return { success: true };
    } catch {
      // Don't reveal errors
      return { success: true };
    }
  },
});

// ============================================================================
// Account Management
// ============================================================================

/**
 * Delete the current user's account.
 * This is a destructive operation and cannot be undone.
 * Rate limited to prevent accidental rapid deletions.
 *
 * @example
 * const deleteAccount = useMutation(api.authMutations.deleteAccount);
 * await deleteAccount({ password: "confirm" });
 */
export const deleteAccount = authMutation({
  args: {
    password: v.optional(v.string()), // For password confirmation
  },
  returns: v.object({ success: v.boolean() }),
  handler: async (ctx, args): Promise<{ success: boolean }> => {
    // Rate limit account deletion attempts
    await rateLimitWithThrow(ctx, "userAction", ctx.user._id.toString());

    try {
      const { auth, headers } = await authComponent.getAuth(createAuth, ctx);

      // Delete the Better Auth user (triggers will clean up app user)
      await auth.api.deleteUser({
        body: args.password ? { password: args.password } : {},
        headers,
      });

      return { success: true };
    } catch (error) {
      if (error instanceof Error && error.message.includes("password")) {
        throw createError(ErrorCode.INVALID_CREDENTIALS, "Password is incorrect");
      }
      throw createError(ErrorCode.INTERNAL_ERROR, "Failed to delete account");
    }
  },
});

/**
 * Update user profile information via Better Auth.
 * Rate limited to prevent spam updates.
 *
 * @example
 * const updateProfile = useMutation(api.authMutations.updateAuthProfile);
 * await updateProfile({ name: "New Name" });
 */
export const updateAuthProfile = authMutation({
  args: {
    name: v.optional(v.string()),
    image: v.optional(v.union(v.string(), v.null())),
  },
  returns: v.object({ success: v.boolean() }),
  handler: async (ctx, args): Promise<{ success: boolean }> => {
    // Rate limit profile updates
    await rateLimitWithThrow(ctx, "userAction", ctx.user._id.toString());

    try {
      const { auth, headers } = await authComponent.getAuth(createAuth, ctx);

      const body: Record<string, unknown> = {};
      if (args.name !== undefined) body.name = args.name;
      if (args.image !== undefined) body.image = args.image;

      if (Object.keys(body).length === 0) {
        return { success: true }; // Nothing to update
      }

      await auth.api.updateUser({
        body,
        headers,
      });

      return { success: true };
    } catch {
      throw createError(ErrorCode.INTERNAL_ERROR, "Failed to update profile");
    }
  },
});

// ============================================================================
// Session Management
// ============================================================================

/**
 * List all active sessions for the current user.
 * Rate limited to prevent abuse.
 *
 * @example
 * const listSessions = useQuery(api.authMutations.listSessions);
 */
export const listSessions = authMutation({
  args: {},
  returns: v.array(
    v.object({
      id: v.string(),
      userAgent: v.optional(v.string()),
      ipAddress: v.optional(v.string()),
      createdAt: v.number(),
      expiresAt: v.number(),
      isCurrent: v.boolean(),
    }),
  ),
  handler: async (ctx) => {
    // Rate limit session listing
    await rateLimitWithThrow(ctx, "apiRead", ctx.user._id.toString());

    try {
      const { auth, headers } = await authComponent.getAuth(createAuth, ctx);

      const sessions = await auth.api.listSessions({
        headers,
      });

      const currentSessionId = ctx.user.authUserId;

      return sessions.map((session: any) => ({
        id: session.id || session._id,
        userAgent: session.userAgent,
        ipAddress: session.ipAddress,
        createdAt: new Date(session.createdAt).getTime(),
        expiresAt: new Date(session.expiresAt).getTime(),
        isCurrent: session.id === currentSessionId || session._id === currentSessionId,
      }));
    } catch {
      return [];
    }
  },
});

/**
 * Revoke a specific session.
 * Rate limited to prevent abuse.
 *
 * @example
 * const revokeSession = useMutation(api.authMutations.revokeSession);
 * await revokeSession({ sessionId: "..." });
 */
export const revokeSession = authMutation({
  args: {
    sessionId: v.string(),
  },
  returns: v.object({ success: v.boolean() }),
  handler: async (ctx, args): Promise<{ success: boolean }> => {
    // Rate limit session revocation
    await rateLimitWithThrow(ctx, "userAction", ctx.user._id.toString());

    try {
      const { auth, headers } = await authComponent.getAuth(createAuth, ctx);

      await auth.api.revokeSession({
        body: { token: args.sessionId },
        headers,
      });

      return { success: true };
    } catch {
      throw createError(ErrorCode.NOT_FOUND, "Session not found");
    }
  },
});

/**
 * Revoke all sessions except the current one.
 * Rate limited to prevent abuse.
 *
 * @example
 * const revokeOtherSessions = useMutation(api.authMutations.revokeOtherSessions);
 * await revokeOtherSessions();
 */
export const revokeOtherSessions = authMutation({
  args: {},
  returns: v.object({ success: v.boolean() }),
  handler: async (ctx): Promise<{ success: boolean }> => {
    // Rate limit bulk session revocation
    await rateLimitWithThrow(ctx, "userAction", ctx.user._id.toString());

    try {
      const { auth, headers } = await authComponent.getAuth(createAuth, ctx);

      await auth.api.revokeOtherSessions({
        headers,
      });

      return { success: true };
    } catch {
      throw createError(ErrorCode.INTERNAL_ERROR, "Failed to revoke sessions");
    }
  },
});

/**
 * Revoke ALL sessions including the current one.
 * This will sign the user out of all devices.
 * Rate limited to prevent abuse.
 *
 * @example
 * const revokeAllSessions = useMutation(api.authMutations.revokeAllSessions);
 * await revokeAllSessions();
 */
export const revokeAllSessions = authMutation({
  args: {},
  returns: v.object({ success: v.boolean() }),
  handler: async (ctx): Promise<{ success: boolean }> => {
    // Rate limit bulk session revocation
    await rateLimitWithThrow(ctx, "userAction", ctx.user._id.toString());

    try {
      const { auth, headers } = await authComponent.getAuth(createAuth, ctx);

      await auth.api.revokeSessions({
        headers,
      });

      return { success: true };
    } catch {
      throw createError(ErrorCode.INTERNAL_ERROR, "Failed to revoke all sessions");
    }
  },
});
