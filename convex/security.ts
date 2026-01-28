/**
 * Row-Level Security (RLS) Configuration
 *
 * RLS provides fine-grained access control at the database layer.
 * Rules are evaluated per-document on each database access.
 *
 * @see https://stack.convex.dev/row-level-security
 */

import {
  customCtx,
  customMutation,
  customQuery,
} from 'convex-helpers/server/customFunctions'
import {
  
  
  wrapDatabaseReader,
  wrapDatabaseWriter
} from 'convex-helpers/server/rowLevelSecurity'

import {
  
  mutation,
  query
} from './_generated/server'
import {
  
  safeGetAuthenticatedUser
} from './auth'
import {
  adminRequired,
  authenticationRequired,
  forbidden,
  moderatorRequired,
} from './errors'
import type {AuthUser} from './auth';
import type {QueryCtx} from './_generated/server';
import type {RLSConfig, Rules} from 'convex-helpers/server/rowLevelSecurity';
import type { DataModel, Id } from './_generated/dataModel'

// ============================================================================
// RLS User Type
// ============================================================================

type RLSUser = {
  _id: Id<'users'>
  authUserId: string
} | null

// ============================================================================
// RLS Rules Definition
// ============================================================================

/**
 * Create RLS rules with an already-fetched user.
 * This avoids duplicate user fetches by receiving the user from the wrapper.
 *
 * Rules return:
 * - true: Allow access
 * - false: Deny access (silently filters for reads, throws for writes)
 * - throw Error: Deny with custom error message
 *
 * Available rule types:
 * - read: Controls who can read documents
 * - insert: Controls who can create documents
 * - modify: Controls who can update/delete documents
 */
function createRLSRulesWithUser(user: RLSUser): Rules<QueryCtx, DataModel> {
  return {
    users: {
      // Anyone can read user profiles (public data)
      read: async (_ctx, _doc) => {
        return true
      },
      // Only authenticated users can create users (handled by auth flow)
      insert: async (_ctx, _doc) => {
        // User creation is handled by Better Auth triggers
        // Direct inserts should be blocked
        return false
      },
      // Users can only modify their own profile
      modify: async (_ctx, doc) => {
        if (!user) {
          throw forbidden('Authentication required to modify user')
        }
        return doc._id === user._id
      },
    },
    // Note: Rate limiting now uses @convex-dev/rate-limiter component
    // which manages its own tables - no RLS rules needed here
    //
    // Audit logs table - write by system only
    // NOTE: Admin read access is handled via adminOnlyQuery which bypasses RLS.
    // These rules only apply to RLS-wrapped queries (queryWithRLS, mutationWithRLS).
    auditLogs: {
      read: async () => false, // Block RLS-wrapped reads (admin access via adminOnlyQuery)
      insert: async () => true, // System can insert via triggers
      modify: async () => false, // Audit logs are immutable
    },
  }
}

// RLS configuration
const rlsConfig: RLSConfig = {
  // Default policy for tables without explicit rules
  // 'allow' = permit access, 'deny' = block access
  defaultPolicy: 'deny',
}

/**
 * Helper to convert AuthUser to RLSUser format.
 */
function toRLSUser(user: AuthUser | undefined): RLSUser {
  if (!user) return null
  return {
    _id: user._id,
    authUserId: user.authUserId,
  }
}

// ============================================================================
// RLS-Wrapped Functions
// ============================================================================

/**
 * Query with Row-Level Security.
 * Database reads are filtered based on RLS rules.
 * Fetches user once and passes to rules (no double fetch).
 *
 * @example
 * export const listUsers = queryWithRLS({
 *   args: {},
 *   handler: async (ctx) => {
 *     // Only returns documents the user has read access to
 *     return await ctx.db.query("users").collect();
 *   },
 * });
 */
export const queryWithRLS = customQuery(
  query,
  customCtx(async (ctx) => {
    // Fetch user once
    const user = await safeGetAuthenticatedUser(ctx)
    const rlsUser = toRLSUser(user)
    const rules = createRLSRulesWithUser(rlsUser)
    return {
      user,
      db: wrapDatabaseReader(ctx, ctx.db, rules, rlsConfig),
    }
  })
)

/**
 * Mutation with Row-Level Security.
 * Database writes are validated against RLS rules.
 * Fetches user once and passes to rules (no double fetch).
 *
 * @example
 * export const updateUser = mutationWithRLS({
 *   args: { id: v.id("users"), name: v.string() },
 *   handler: async (ctx, args) => {
 *     // Throws if user doesn't have modify access
 *     await ctx.db.patch(args.id, { name: args.name });
 *   },
 * });
 */
export const mutationWithRLS = customMutation(
  mutation,
  customCtx(async (ctx) => {
    // Fetch user once
    const user = await safeGetAuthenticatedUser(ctx)
    const rlsUser = toRLSUser(user)
    const rules = createRLSRulesWithUser(rlsUser)
    return {
      user,
      db: wrapDatabaseWriter(ctx, ctx.db, rules, rlsConfig),
    }
  })
)

/**
 * Combined: Authenticated query with RLS.
 * Requires authentication AND enforces RLS rules.
 * Single user fetch shared between auth check and RLS rules.
 */
export const authQueryWithRLS = customQuery(
  query,
  customCtx(async (ctx) => {
    // Fetch user once, use for both auth check and RLS
    const user = await safeGetAuthenticatedUser(ctx)
    if (!user) {
      throw authenticationRequired()
    }
    const rlsUser = toRLSUser(user)
    const rules = createRLSRulesWithUser(rlsUser)
    return {
      user,
      db: wrapDatabaseReader(ctx, ctx.db, rules, rlsConfig),
    }
  })
)

/**
 * Combined: Authenticated mutation with RLS.
 * Requires authentication AND enforces RLS rules.
 * Single user fetch shared between auth check and RLS rules.
 */
export const authMutationWithRLS = customMutation(
  mutation,
  customCtx(async (ctx) => {
    // Fetch user once, use for both auth check and RLS
    const user = await safeGetAuthenticatedUser(ctx)
    if (!user) {
      throw authenticationRequired()
    }
    const rlsUser = toRLSUser(user)
    const rules = createRLSRulesWithUser(rlsUser)
    return {
      user,
      db: wrapDatabaseWriter(ctx, ctx.db, rules, rlsConfig),
    }
  })
)

// ============================================================================
// Role-Based Access Control (RBAC) Helpers
// ============================================================================

/**
 * Helper to check role from AuthUser.
 * Uses the same user fetch as other auth helpers to avoid duplicate DB lookups.
 */
function checkRole(user: AuthUser | undefined, requiredRoles: Array<string>): void {
  if (!user) {
    throw authenticationRequired()
  }
  // Default role is 'user' if not set
  const role = user.role ?? 'user'
  if (!requiredRoles.includes(role)) {
    if (requiredRoles.includes('admin') && requiredRoles.length === 1) {
      throw adminRequired()
    }
    throw moderatorRequired()
  }
}

/**
 * Admin-only query.
 * Throws if user is not authenticated or not an admin.
 * Uses safeGetAuthenticatedUser to avoid duplicate DB lookups.
 *
 * @example
 * export const listAllUsers = adminOnlyQuery({
 *   args: {},
 *   handler: async (ctx) => {
 *     // Only admins can access this
 *     return await ctx.db.query("users").collect();
 *   },
 * });
 */
export const adminOnlyQuery = customQuery(
  query,
  customCtx(async (ctx) => {
    // Single user fetch - safeGetAuthenticatedUser already includes role
    const user = await safeGetAuthenticatedUser(ctx)
    checkRole(user, ['admin'])
    return { user: user! }
  })
)

/**
 * Admin-only mutation.
 * Throws if user is not authenticated or not an admin.
 * Uses safeGetAuthenticatedUser to avoid duplicate DB lookups.
 *
 * @example
 * export const deleteAnyUser = adminOnlyMutation({
 *   args: { userId: v.id("users") },
 *   handler: async (ctx, args) => {
 *     // Only admins can delete users
 *     await ctx.db.delete(args.userId);
 *   },
 * });
 */
export const adminOnlyMutation = customMutation(
  mutation,
  customCtx(async (ctx) => {
    // Single user fetch - safeGetAuthenticatedUser already includes role
    const user = await safeGetAuthenticatedUser(ctx)
    checkRole(user, ['admin'])
    return { user: user! }
  })
)

/**
 * Moderator or Admin query.
 * Throws if user is not authenticated or doesn't have moderator/admin role.
 * Uses safeGetAuthenticatedUser to avoid duplicate DB lookups.
 *
 * @example
 * export const listReportedContent = moderatorQuery({
 *   args: {},
 *   handler: async (ctx) => {
 *     return await ctx.db.query("reports").collect();
 *   },
 * });
 */
export const moderatorQuery = customQuery(
  query,
  customCtx(async (ctx) => {
    // Single user fetch - safeGetAuthenticatedUser already includes role
    const user = await safeGetAuthenticatedUser(ctx)
    checkRole(user, ['admin', 'moderator'])
    return { user: user! }
  })
)

/**
 * Moderator or Admin mutation.
 * Throws if user is not authenticated or doesn't have moderator/admin role.
 * Uses safeGetAuthenticatedUser to avoid duplicate DB lookups.
 *
 * @example
 * export const resolveReport = moderatorMutation({
 *   args: { reportId: v.id("reports"), resolution: v.string() },
 *   handler: async (ctx, args) => {
 *     await ctx.db.patch(args.reportId, { resolved: true, resolution: args.resolution });
 *   },
 * });
 */
export const moderatorMutation = customMutation(
  mutation,
  customCtx(async (ctx) => {
    // Single user fetch - safeGetAuthenticatedUser already includes role
    const user = await safeGetAuthenticatedUser(ctx)
    checkRole(user, ['admin', 'moderator'])
    return { user: user! }
  })
)
