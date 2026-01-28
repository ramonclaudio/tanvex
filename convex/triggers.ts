/**
 * Database Triggers
 *
 * Triggers automatically execute when documents change.
 * Use for denormalization, cascade updates, and side effects.
 * Now writes to auditLogs table instead of console.log.
 *
 * IMPORTANT - innerDb Pattern:
 * When using triggers, the context provides `ctx.innerDb` for direct database
 * access that bypasses trigger execution. Use this when you need to:
 * - Avoid recursive trigger loops
 * - Make writes that shouldn't trigger additional side effects
 *
 * Example:
 * ```typescript
 * triggers.register('users', async (ctx, change) => {
 *   // This write will NOT trigger another 'users' trigger
 *   await ctx.innerDb.patch(change.id, { lastProcessed: Date.now() });
 *
 *   // This write WILL trigger any 'auditLogs' triggers
 *   await ctx.db.insert('auditLogs', { ... });
 * });
 * ```
 *
 * @see https://stack.convex.dev/triggers
 */

import { Triggers } from "convex-helpers/server/triggers";
import { customCtx, customMutation } from "convex-helpers/server/customFunctions";

import { v } from "convex/values";
import { mutation as rawMutation } from "./_generated/server";
import { requireAuthenticatedUser, safeGetAuthenticatedUser } from "./auth";
import { auditActionValidator } from "./schema";

// ============================================================================
// Audit Log Queries (for admin use)
// ============================================================================

import { adminOnlyQuery } from "./security";
import type { MutationCtx } from "./_generated/server";
import type { DataModel, Id } from "./_generated/dataModel";
import type { Infer } from "convex/values";

// Type for audit actions
type AuditAction = Infer<typeof auditActionValidator>;

// Create triggers instance for this data model
const triggers = new Triggers<DataModel>();

// ============================================================================
// Audit Logging Helper
// ============================================================================

/**
 * Write an audit log entry.
 * This is a helper function to write structured audit logs.
 */
async function writeAuditLog(
  ctx: MutationCtx,
  data: {
    action: AuditAction;
    userId?: Id<"users">;
    authUserId?: string;
    targetId?: string;
    targetType?: string;
    metadata?: Record<string, unknown>;
  },
) {
  await ctx.db.insert("auditLogs", {
    action: data.action,
    userId: data.userId,
    authUserId: data.authUserId,
    targetId: data.targetId,
    targetType: data.targetType,
    metadata: data.metadata,
    timestamp: Date.now(),
  });
}

// ============================================================================
// User Triggers
// ============================================================================

/**
 * Track user updates for audit logging.
 * Writes to auditLogs table instead of console.log.
 */
triggers.register("users", async (ctx, change) => {
  if (change.operation === "insert") {
    // New user created
    await writeAuditLog(ctx, {
      action: "user.created",
      userId: change.newDoc._id,
      authUserId: change.newDoc.authId,
      targetId: change.newDoc._id.toString(),
      targetType: "users",
      metadata: {
        email: change.newDoc.email,
        firstName: change.newDoc.firstName ?? null,
        lastName: change.newDoc.lastName ?? null,
      },
    });
  } else if (change.operation === "update") {
    // User updated
    const oldRole = change.oldDoc.role ?? "user";
    const newRole = change.newDoc.role ?? "user";
    const roleChanged = oldRole !== newRole;

    if (roleChanged) {
      // Track role changes specifically
      await writeAuditLog(ctx, {
        action: "user.role_changed",
        userId: change.newDoc._id,
        authUserId: change.newDoc.authId,
        targetId: change.newDoc._id.toString(),
        targetType: "users",
        metadata: {
          oldRole,
          newRole,
        },
      });
    } else {
      // General update
      await writeAuditLog(ctx, {
        action: "user.updated",
        userId: change.newDoc._id,
        authUserId: change.newDoc.authId,
        targetId: change.newDoc._id.toString(),
        targetType: "users",
        metadata: {
          updatedFields: Object.keys(change.newDoc).filter(
            (key) =>
              key !== "_id" &&
              key !== "_creationTime" &&
              (change.oldDoc as any)[key] !== (change.newDoc as any)[key],
          ),
        },
      });
    }
  } else {
    // User deleted
    await writeAuditLog(ctx, {
      action: "user.deleted",
      userId: change.oldDoc._id,
      authUserId: change.oldDoc.authId,
      targetId: change.oldDoc._id.toString(),
      targetType: "users",
      metadata: {
        email: change.oldDoc.email,
      },
    });
  }
});

// ============================================================================
// Mutation Wrappers with Triggers
// ============================================================================

/**
 * Mutation wrapper that executes registered triggers.
 * Use this instead of raw mutation when you need triggers to fire.
 *
 * @example
 * export const updateUser = mutationWithTriggers({
 *   args: { userId: v.id('users'), name: v.string() },
 *   handler: async (ctx, args) => {
 *     await ctx.db.patch(args.userId, { name: args.name });
 *   },
 * });
 */
export const mutationWithTriggers = customMutation(
  rawMutation,
  customCtx((ctx: MutationCtx) => ({
    db: triggers.wrapDB(ctx),
  })),
);

/**
 * Authenticated mutation with triggers.
 * Requires authentication AND executes registered triggers.
 *
 * @example
 * export const updateProfile = authMutationWithTriggers({
 *   args: { name: v.string() },
 *   handler: async (ctx, args) => {
 *     // ctx.user is guaranteed to exist
 *     // Triggers will fire on db operations
 *     await ctx.db.patch(ctx.user._id, { name: args.name });
 *   },
 * });
 */
export const authMutationWithTriggers = customMutation(
  rawMutation,
  customCtx(async (ctx: MutationCtx) => {
    const user = await requireAuthenticatedUser(ctx);
    return {
      user,
      db: triggers.wrapDB(ctx),
    };
  }),
);

/**
 * Optional auth mutation with triggers.
 * User may be undefined, but triggers will still fire.
 *
 * @example
 * export const trackAction = optionalAuthMutationWithTriggers({
 *   args: { action: v.string() },
 *   handler: async (ctx, args) => {
 *     // ctx.user may be undefined
 *     // Triggers will fire on db operations
 *   },
 * });
 */
export const optionalAuthMutationWithTriggers = customMutation(
  rawMutation,
  customCtx(async (ctx: MutationCtx) => {
    const user = await safeGetAuthenticatedUser(ctx);
    return {
      user,
      db: triggers.wrapDB(ctx),
    };
  }),
);

/**
 * Validator for audit log entries.
 */
const auditLogEntryValidator = v.object({
  _id: v.id("auditLogs"),
  _creationTime: v.number(),
  action: auditActionValidator,
  userId: v.optional(v.id("users")),
  authUserId: v.optional(v.string()),
  targetId: v.optional(v.string()),
  targetType: v.optional(v.string()),
  metadata: v.optional(v.any()),
  ipAddress: v.optional(v.string()),
  userAgent: v.optional(v.string()),
  timestamp: v.number(),
});

/**
 * Validator for paginated audit log response.
 */
const paginatedAuditLogsValidator = v.object({
  page: v.array(auditLogEntryValidator),
  continueCursor: v.string(),
  isDone: v.boolean(),
});

/**
 * List audit logs with pagination.
 * Admin only.
 */
export const listAuditLogs = adminOnlyQuery({
  args: {
    cursor: v.optional(v.string()),
    limit: v.optional(v.number()),
    userId: v.optional(v.id("users")),
    action: v.optional(v.string()),
  },
  returns: paginatedAuditLogsValidator,
  handler: async (ctx, args) => {
    const limit = Math.min(Math.max(args.limit ?? 50, 1), 100);

    // Build query with appropriate index
    let result;
    if (args.userId) {
      result = await ctx.db
        .query("auditLogs")
        .withIndex("userId", (q) => q.eq("userId", args.userId))
        .order("desc")
        .paginate({ cursor: args.cursor ?? null, numItems: limit });
    } else if (args.action) {
      result = await ctx.db
        .query("auditLogs")
        .withIndex("action", (q) => q.eq("action", args.action as any))
        .order("desc")
        .paginate({ cursor: args.cursor ?? null, numItems: limit });
    } else {
      result = await ctx.db
        .query("auditLogs")
        .withIndex("timestamp")
        .order("desc")
        .paginate({ cursor: args.cursor ?? null, numItems: limit });
    }

    return {
      page: result.page,
      continueCursor: result.continueCursor,
      isDone: result.isDone,
    };
  },
});

/**
 * Get audit logs for a specific user.
 * Admin only.
 */
export const getAuditLogsForUser = adminOnlyQuery({
  args: {
    userId: v.id("users"),
    limit: v.optional(v.number()),
  },
  returns: v.array(auditLogEntryValidator),
  handler: async (ctx, args) => {
    const limit = Math.min(Math.max(args.limit ?? 50, 1), 100);

    return await ctx.db
      .query("auditLogs")
      .withIndex("userId", (q) => q.eq("userId", args.userId))
      .order("desc")
      .take(limit);
  },
});

// Export triggers for use in other modules
export { triggers };
