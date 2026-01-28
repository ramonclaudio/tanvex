/**
 * Zod-Validated Functions
 *
 * Use Zod schemas for both runtime validation AND static type inference.
 * Provides better error messages and validation than raw Convex validators.
 *
 * @see https://stack.convex.dev/zod-validation
 */

import { z } from 'zod'
import { zCustomMutation, zCustomQuery, zid as zidBase } from 'convex-helpers/server/zod4'
import { NoOp } from 'convex-helpers/server/customFunctions'
import { mutation, query } from './_generated/server'
import type { DataModel, TableNames } from './_generated/dataModel'

// ============================================================================
// Zod Function Builders
// ============================================================================

/**
 * Query with Zod validation.
 * Args are validated at runtime with helpful error messages.
 */
export const zodQuery = zCustomQuery(query, NoOp)

/**
 * Mutation with Zod validation.
 * Args are validated at runtime with helpful error messages.
 */
export const zodMutation = zCustomMutation(mutation, NoOp)

// ============================================================================
// Reusable Zod Schemas
// ============================================================================

/**
 * Email schema with format validation.
 */
export const emailSchema = z.string().email('Invalid email format')

/**
 * Password schema with strength requirements.
 */
export const passwordSchema = z
  .string()
  .min(8, 'Password must be at least 8 characters')
  .max(100, 'Password must be less than 100 characters')
  .regex(/[A-Z]/, 'Password must contain at least one uppercase letter')
  .regex(/[a-z]/, 'Password must contain at least one lowercase letter')
  .regex(/[0-9]/, 'Password must contain at least one number')

/**
 * Username schema.
 */
export const usernameSchema = z
  .string()
  .min(3, 'Username must be at least 3 characters')
  .max(30, 'Username must be less than 30 characters')
  .regex(/^[a-zA-Z0-9_]+$/, 'Username can only contain letters, numbers, and underscores')

/**
 * URL schema.
 */
export const urlSchema = z.string().url('Invalid URL format')

/**
 * Pagination schema.
 */
export const paginationSchema = z.object({
  cursor: z.string().nullable().optional(),
  limit: z.number().int().min(1).max(100).default(20),
})

/**
 * User profile update schema.
 * Note: Avatar is managed via separate upload/delete mutations.
 */
export const userProfileSchema = z.object({
  firstName: z.string().min(1).max(50).optional(),
  lastName: z.string().min(1).max(50).optional(),
  bio: z.string().max(500).optional(),
})

/**
 * Search schema.
 */
export const searchSchema = z.object({
  query: z.string().min(1).max(100),
  filters: z.record(z.string(), z.unknown()).optional(),
})

// ============================================================================
// Convex ID Schema Helper
// ============================================================================

/**
 * Create a Zod schema for a Convex ID.
 * Validates that the string is a valid ID for the given table.
 *
 * @example
 * const args = z.object({
 *   userId: zid('users'),
 *   postId: zid('posts'),
 * });
 */
export function zid<T extends TableNames>(tableName: T) {
  return zidBase<DataModel, T>(tableName)
}

// ============================================================================
// Example Zod-Validated Functions
// ============================================================================

/**
 * Example: Search users with Zod validation.
 * The schema provides both runtime validation AND TypeScript types.
 */
export const searchUsers = zodQuery({
  args: z.object({
    query: z.string().min(1, 'Search query is required'),
    limit: z.number().int().min(1).max(50).default(10),
  }),
  handler: async (ctx, args) => {
    // args.query is guaranteed to be a non-empty string
    // args.limit is guaranteed to be between 1 and 50
    const users = await ctx.db
      .query('users')
      .filter((q) =>
        q.or(
          q.eq(q.field('firstName'), args.query),
          q.eq(q.field('lastName'), args.query),
          q.eq(q.field('email'), args.query)
        )
      )
      .take(args.limit)

    return users
  },
})

/**
 * Example: Update profile with Zod validation.
 */
export const updateProfileZod = zodMutation({
  args: z.object({
    userId: zid('users'),
    profile: userProfileSchema,
  }),
  handler: async (ctx, args) => {
    const user = await ctx.db.get(args.userId)
    if (!user) {
      throw new Error('User not found')
    }

    await ctx.db.patch(args.userId, {
      ...args.profile,
      updatedAt: Date.now(),
    })

    return args.userId
  },
})
