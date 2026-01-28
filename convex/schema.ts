import { defineSchema, defineTable } from 'convex/server'
import { v } from 'convex/values'
import { literals, nullable, partial } from 'convex-helpers/validators'
import { migrationsTable } from 'convex-helpers/server/migrations'

// Note: Rate limiting now uses @convex-dev/rate-limiter component
// which manages its own tables - no need for rateLimitTables in schema

// Role validator - used for RBAC
export const roleValidator = literals('user', 'admin', 'moderator')

// Audit action validator
export const auditActionValidator = literals(
  'user.created',
  'user.updated',
  'user.deleted',
  'user.role_changed',
  'auth.sign_in',
  'auth.sign_out',
  'auth.password_changed',
  'auth.email_changed',
  'profile.updated'
)

// Reusable field validators
// Note: Use v.optional() for fields that may not exist on existing documents
// Use nullable() for fields that can explicitly be null
export const userFields = {
  authId: v.string(), // Better Auth user ID for efficient lookups
  email: v.string(),
  username: v.optional(v.string()), // Normalized username (lowercase, unique)
  displayUsername: v.optional(v.string()), // Display username (original casing)
  firstName: v.optional(v.string()), // User's first name (parsed from Better Auth name)
  lastName: v.optional(v.string()), // User's last name (parsed from Better Auth name)
  avatar: v.optional(nullable(v.id('_storage'))), // Storage ID for uploaded avatars (overrides auth provider image)
  bio: v.optional(v.string()),
  role: v.optional(roleValidator), // defaults to 'user' if not set
  createdAt: v.optional(v.number()),
  updatedAt: v.optional(v.number()),
}

// Partial validators for updates (all fields optional, excluding authId)
export const userUpdateFields = partial({
  email: userFields.email,
  username: userFields.username,
  displayUsername: userFields.displayUsername,
  firstName: userFields.firstName,
  lastName: userFields.lastName,
  bio: userFields.bio,
  role: userFields.role,
  updatedAt: userFields.updatedAt,
})

// Public user fields (for API responses)
export const publicUserFields = {
  firstName: userFields.firstName,
  lastName: userFields.lastName,
  avatar: userFields.avatar,
  bio: userFields.bio,
}

// Audit log fields
export const auditLogFields = {
  action: auditActionValidator,
  userId: v.optional(v.id('users')),
  authUserId: v.optional(v.string()),
  targetId: v.optional(v.string()),
  targetType: v.optional(v.string()),
  metadata: v.optional(v.any()),
  ipAddress: v.optional(v.string()),
  userAgent: v.optional(v.string()),
  timestamp: v.number(),
}

export default defineSchema({
  // Application users table - stores app-specific user data
  // Better Auth component handles auth tables (user, session, account, etc.)
  users: defineTable({
    authId: userFields.authId,
    email: userFields.email,
    username: userFields.username,
    displayUsername: userFields.displayUsername,
    firstName: userFields.firstName,
    lastName: userFields.lastName,
    avatar: userFields.avatar,
    bio: userFields.bio,
    role: userFields.role,
    createdAt: userFields.createdAt,
    updatedAt: userFields.updatedAt,
  })
    .index('email', ['email'])
    .index('authId', ['authId'])
    .index('username', ['username'])
    // Index for listing users by creation time (used by listUsers query)
    // Note: _creationTime is automatically used for default ordering,
    // but this explicit index allows efficient filtering by createdAt field
    .index('createdAt', ['createdAt']),

  // Audit logs table - tracks important user and system actions
  auditLogs: defineTable({
    action: auditLogFields.action,
    userId: auditLogFields.userId,
    authUserId: auditLogFields.authUserId,
    targetId: auditLogFields.targetId,
    targetType: auditLogFields.targetType,
    metadata: auditLogFields.metadata,
    ipAddress: auditLogFields.ipAddress,
    userAgent: auditLogFields.userAgent,
    timestamp: auditLogFields.timestamp,
  })
    .index('userId', ['userId'])
    .index('action', ['action'])
    .index('timestamp', ['timestamp'])
    .index('userId_timestamp', ['userId', 'timestamp']),

  // Migrations table (from convex-helpers)
  migrations: migrationsTable,
})
