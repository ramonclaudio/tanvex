/**
 * Database Migrations
 *
 * Use migrations to transform existing data when schema changes.
 * Run migrations via the Convex dashboard or CLI.
 *
 * @see https://stack.convex.dev/migrating-data-with-mutations
 */

import { makeMigration } from 'convex-helpers/server/migrations'
import { internalMutation } from './_generated/server'

// Create a migration runner bound to this app's internal mutation
const migration = makeMigration(internalMutation, {
  migrationTable: 'migrations',
})

/**
 * Example migration: Add default role to users without one.
 *
 * Run via: npx convex run migrations:addDefaultRole
 */
export const addDefaultRole = migration({
  table: 'users',
  migrateOne: async (ctx, user) => {
    if (user.role === undefined) {
      await ctx.db.patch(user._id, { role: 'user' })
    }
  },
})

/**
 * Example migration: Backfill createdAt timestamps.
 *
 * Run via: npx convex run migrations:backfillTimestamps
 */
export const backfillTimestamps = migration({
  table: 'users',
  migrateOne: async (ctx, user) => {
    const updates: { createdAt?: number; updatedAt?: number } = {}
    if (user.createdAt === undefined) {
      updates.createdAt = user._creationTime
    }
    if (user.updatedAt === undefined) {
      updates.updatedAt = user._creationTime
    }
    if (Object.keys(updates).length > 0) {
      await ctx.db.patch(user._id, updates)
    }
  },
})

/**
 * Run migrations using the Convex dashboard or CLI.
 *
 * @example
 * // Run a single migration:
 * npx convex run migrations:addDefaultRole
 *
 * // Run with options:
 * npx convex run migrations:addDefaultRole '{"dryRun": true}'
 */
