/**
 * Validator Utilities
 *
 * Centralized validators and helpers for schema definitions and function arguments.
 * All validators are defined once and exported for reuse across the codebase.
 *
 * @see https://stack.convex.dev/argument-validation-without-repetition
 */

import {  v } from 'convex/values'
import {
  brandedString,
  literals,
  nullable,
  partial,
} from 'convex-helpers/validators'

// Import for type derivation
import { roleValidator } from './schema'
import type {Infer} from 'convex/values';
import type { auditActionValidator } from './schema';

// Re-export for convenience
export { nullable, partial, literals, brandedString }

// ============================================================================
// Re-export schema validators (single source of truth)
// ============================================================================

export {
  roleValidator,
  auditActionValidator,
  userFields,
  userUpdateFields,
  publicUserFields,
  auditLogFields,
} from './schema'

// Re-export name utilities from auth
export { combineNames } from './auth'

// ============================================================================
// Branded String Types
// ============================================================================

/**
 * Email validator - ensures the value is marked as an email type.
 * Note: This doesn't validate email format at runtime, just provides type safety.
 * For runtime validation, use zod with zCustomQuery/zCustomMutation.
 *
 * @example
 * const user = { email: "test@example.com" as Email };
 */
export const emailValidator = brandedString('email')
export type Email = Infer<typeof emailValidator>

/**
 * URL validator - ensures the value is marked as a URL type.
 */
export const urlValidator = brandedString('url')
export type Url = Infer<typeof urlValidator>

/**
 * Slug validator - for URL-safe identifiers.
 */
export const slugValidator = brandedString('slug')
export type Slug = Infer<typeof slugValidator>

// ============================================================================
// Type Exports (derived from schema validators)
// ============================================================================

export type Role = Infer<typeof roleValidator>
export type AuditAction = Infer<typeof auditActionValidator>

// ============================================================================
// Common Literal Unions
// ============================================================================

/**
 * Common status values for entities.
 */
export const statusValidator = literals('active', 'inactive', 'pending', 'archived')
export type Status = Infer<typeof statusValidator>

/**
 * Visibility settings.
 */
export const visibilityValidator = literals('public', 'private', 'unlisted')
export type Visibility = Infer<typeof visibilityValidator>

/**
 * Sort order options.
 */
export const sortOrderValidator = literals('asc', 'desc')
export type SortOrder = Infer<typeof sortOrderValidator>

// ============================================================================
// Common Field Validators
// ============================================================================

/**
 * Timestamp fields - for createdAt/updatedAt patterns.
 */
export const timestampFields = {
  createdAt: v.optional(v.number()),
  updatedAt: v.optional(v.number()),
}

/**
 * Soft delete fields - for entities that can be "deleted" but retained.
 */
export const softDeleteFields = {
  deletedAt: v.optional(v.number()),
  isDeleted: v.optional(v.boolean()),
}

/**
 * Audit fields - who created/updated the record.
 */
export const auditFields = {
  createdBy: v.optional(v.id('users')),
  updatedBy: v.optional(v.id('users')),
}

// ============================================================================
// Pagination & Search Validators
// ============================================================================

/**
 * Standard pagination arguments.
 */
export const paginationArgs = {
  cursor: v.optional(v.union(v.string(), v.null())),
  limit: v.optional(v.number()),
}

/**
 * Search arguments with optional query and filters.
 */
export const searchArgs = {
  query: v.optional(v.string()),
  filters: v.optional(v.any()),
}

/**
 * Paginated response structure.
 */
export const paginatedResponseFields = {
  continueCursor: v.string(),
  isDone: v.boolean(),
}

// ============================================================================
// User Profile Validators
// ============================================================================

/**
 * User profile fields for updates (shared between mutations).
 * Note: Avatar is managed via separate updateAvatar/deleteAvatar mutations.
 */
export const userProfileUpdateFields = {
  firstName: v.optional(v.string()),
  lastName: v.optional(v.string()),
  bio: v.optional(v.string()),
}

/**
 * User preferences fields.
 */
export const userPreferencesFields = {
  theme: v.optional(literals('light', 'dark', 'system')),
  language: v.optional(v.string()),
  notifications: v.optional(v.boolean()),
}

// ============================================================================
// Public User Profile Validator (for API responses)
// ============================================================================

/**
 * Validator for public user profile data returned by queries.
 */
export const publicUserProfileValidator = v.object({
  _id: v.id('users'),
  _creationTime: v.number(),
  firstName: v.optional(v.string()),
  lastName: v.optional(v.string()),
  fullName: v.optional(v.string()), // Computed convenience field
  avatar: v.optional(v.union(v.string(), v.null())),
  bio: v.optional(v.string()),
  email: v.optional(v.string()), // Only included for own profile
})

/**
 * Validator for full user data (internal use).
 */
export const fullUserValidator = v.object({
  _id: v.id('users'),
  _creationTime: v.number(),
  authId: v.string(),
  email: v.string(),
  username: v.optional(v.string()),
  displayUsername: v.optional(v.string()),
  firstName: v.optional(v.string()),
  lastName: v.optional(v.string()),
  avatar: v.optional(v.union(v.id('_storage'), v.null())),
  bio: v.optional(v.string()),
  role: v.optional(roleValidator),
  createdAt: v.optional(v.number()),
  updatedAt: v.optional(v.number()),
})

/**
 * Validator for paginated user list response.
 */
export const paginatedUsersValidator = v.object({
  page: v.array(
    v.object({
      _id: v.id('users'),
      _creationTime: v.number(),
      firstName: v.optional(v.string()),
      lastName: v.optional(v.string()),
      fullName: v.optional(v.string()),
      avatar: v.optional(v.union(v.string(), v.null())),
      bio: v.optional(v.string()),
    })
  ),
  continueCursor: v.string(),
  isDone: v.boolean(),
})

// ============================================================================
// Validation Constants
// ============================================================================

/**
 * Field length limits for validation.
 */
export const FIELD_LIMITS = {
  FIRST_NAME_MAX_LENGTH: 50,
  LAST_NAME_MAX_LENGTH: 50,
  BIO_MAX_LENGTH: 500,
  EMAIL_MAX_LENGTH: 254,
  PASSWORD_MIN_LENGTH: 8,
  PASSWORD_MAX_LENGTH: 128,
} as const

// ============================================================================
// Validation Helper Functions
// ============================================================================

/**
 * Validate and sanitize a first name field.
 */
export function validateFirstName(firstName: string): { valid: boolean; error?: string; sanitized?: string } {
  const trimmed = firstName.trim()
  if (trimmed.length === 0) {
    return { valid: false, error: 'First name cannot be empty' }
  }
  if (trimmed.length > FIELD_LIMITS.FIRST_NAME_MAX_LENGTH) {
    return { valid: false, error: `First name must be ${FIELD_LIMITS.FIRST_NAME_MAX_LENGTH} characters or less` }
  }
  return { valid: true, sanitized: trimmed }
}

/**
 * Validate and sanitize a last name field.
 */
export function validateLastName(lastName: string): { valid: boolean; error?: string; sanitized?: string } {
  const trimmed = lastName.trim()
  if (trimmed.length === 0) {
    return { valid: false, error: 'Last name cannot be empty' }
  }
  if (trimmed.length > FIELD_LIMITS.LAST_NAME_MAX_LENGTH) {
    return { valid: false, error: `Last name must be ${FIELD_LIMITS.LAST_NAME_MAX_LENGTH} characters or less` }
  }
  return { valid: true, sanitized: trimmed }
}

/**
 * Validate a bio field.
 */
export function validateBio(bio: string): { valid: boolean; error?: string } {
  if (bio.length > FIELD_LIMITS.BIO_MAX_LENGTH) {
    return { valid: false, error: `Bio must be ${FIELD_LIMITS.BIO_MAX_LENGTH} characters or less` }
  }
  return { valid: true }
}

/**
 * Validate email format.
 */
export function validateEmail(email: string): { valid: boolean; error?: string } {
  if (email.length > FIELD_LIMITS.EMAIL_MAX_LENGTH) {
    return { valid: false, error: `Email must be ${FIELD_LIMITS.EMAIL_MAX_LENGTH} characters or less` }
  }
  // Basic email regex - for strict validation use a library
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
  if (!emailRegex.test(email)) {
    return { valid: false, error: 'Invalid email format' }
  }
  return { valid: true }
}
