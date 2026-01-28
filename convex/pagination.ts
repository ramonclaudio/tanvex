/**
 * Pagination Utilities
 *
 * Advanced cursor-based pagination helpers for reactive queries.
 * Use when the built-in .paginate() doesn't fit your needs.
 *
 * @see https://stack.convex.dev/pagination
 */

import { v } from 'convex/values'
import { query } from './_generated/server'
import { combineNames } from './auth'
import type { Doc, TableNames } from './_generated/dataModel'

// ============================================================================
// Pagination Types
// ============================================================================

/**
 * Standard pagination arguments.
 */
export const paginationArgs = {
  cursor: v.union(v.string(), v.null()),
  limit: v.optional(v.number()),
}

/**
 * Standard pagination result type.
 */
export interface PaginationResult<T> {
  page: Array<T>
  nextCursor: string | null
  hasMore: boolean
}

// ============================================================================
// Pagination Helpers
// ============================================================================

/**
 * Paginate users with custom sorting and filtering.
 * Uses getPage for stable, gapless pagination.
 *
 * @example
 * const { page, nextCursor, hasMore } = useQuery(api.pagination.paginateUsers, {
 *   cursor: null,
 *   limit: 20,
 * });
 */
export const paginateUsers = query({
  args: {
    ...paginationArgs,
    sortBy: v.optional(v.union(v.literal('createdAt'), v.literal('firstName'), v.literal('email'))),
    order: v.optional(v.union(v.literal('asc'), v.literal('desc'))),
  },
  returns: v.object({
    page: v.array(
      v.object({
        _id: v.id('users'),
        _creationTime: v.number(),
        email: v.string(),
        firstName: v.optional(v.string()),
        lastName: v.optional(v.string()),
        fullName: v.optional(v.string()),
        avatar: v.optional(v.union(v.string(), v.null())),
        bio: v.optional(v.string()),
        role: v.optional(v.union(v.literal('user'), v.literal('admin'), v.literal('moderator'))),
        createdAt: v.optional(v.number()),
      })
    ),
    nextCursor: v.union(v.string(), v.null()),
    hasMore: v.boolean(),
  }),
  handler: async (ctx, args) => {
    const limit = args.limit ?? 20
    const order = args.order ?? 'desc'

    // Use standard Convex pagination
    const result = await ctx.db
      .query('users')
      .order(order)
      .paginate({ cursor: args.cursor, numItems: limit })

    // Map to public fields only and resolve avatar URLs
    const page = await Promise.all(
      result.page.map(async (user) => ({
        _id: user._id,
        _creationTime: user._creationTime,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        fullName: combineNames(user.firstName, user.lastName) || undefined,
        avatar: user.avatar ? await ctx.storage.getUrl(user.avatar) : null,
        bio: user.bio,
        role: user.role,
        createdAt: user.createdAt,
      }))
    )

    return {
      page,
      nextCursor: result.continueCursor,
      hasMore: !result.isDone,
    }
  },
})

/**
 * Generic paginated list query builder.
 * Use this pattern for other tables.
 *
 * @example
 * // In your table-specific file:
 * export const paginatePosts = createPaginatedQuery('posts', ['title', 'content', 'authorId']);
 */
export function createPaginationHandler<T extends TableNames>(
  _tableName: T,
  publicFields: Array<keyof Doc<T>>
) {
  return async (
    ctx: { db: any },
    args: { cursor: string | null; limit?: number; order?: 'asc' | 'desc' }
  ): Promise<PaginationResult<Partial<Doc<T>>>> => {
    const limit = args.limit ?? 20
    const order = args.order ?? 'desc'

    // Use standard Convex pagination
    const result = await ctx.db
      .query(_tableName)
      .order(order)
      .paginate({ cursor: args.cursor, numItems: limit })

    // Filter to only public fields
    const page = result.page.map((doc: any) => {
      const filtered: Partial<Doc<T>> = {
        _id: doc._id,
        _creationTime: doc._creationTime,
      } as Partial<Doc<T>>
      for (const field of publicFields) {
        if (field in doc) {
          (filtered as any)[field] = doc[field]
        }
      }
      return filtered
    })

    return {
      page,
      nextCursor: result.continueCursor,
      hasMore: !result.isDone,
    }
  }
}

// ============================================================================
// Cursor Utilities
// ============================================================================

/**
 * Encode a cursor for client-side use.
 */
export function encodeCursor(indexKey: unknown): string {
  return Buffer.from(JSON.stringify(indexKey)).toString('base64')
}

/**
 * Decode a cursor from client-side.
 */
export function decodeCursor(cursor: string): unknown {
  return JSON.parse(Buffer.from(cursor, 'base64').toString('utf-8'))
}

/**
 * Validate pagination limit.
 */
export function validateLimit(limit: number | undefined, max = 100, defaultValue = 20): number {
  if (limit === undefined) return defaultValue
  if (limit < 1) return 1
  if (limit > max) return max
  return limit
}
