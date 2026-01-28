/**
 * Convex Helpers - Centralized Re-exports
 *
 * Import commonly used helpers from this file instead of directly from convex-helpers.
 * This provides a single point of import and allows for easy customization.
 */

// ============================================================================
// Relationship Helpers
// ============================================================================

/**
 * Traverse database relationships without boilerplate.
 * @see https://stack.convex.dev/functional-relationships-helpers
 */
export {
  getOrThrow,
  getAll,
  getAllOrThrow,
  getManyFrom,
  getManyVia,
  getManyViaOrThrow,
  getOneFrom,
  getOneFromOrThrow,
} from 'convex-helpers/server/relationships'

// ============================================================================
// General Utilities
// ============================================================================

/**
 * Async utilities and object helpers.
 */
export {
  asyncMap,
  pruneNull,
  nullThrows,
  pick,
  omit,
  withoutSystemFields,
} from 'convex-helpers'

// ============================================================================
// Validator Utilities
// ============================================================================

/**
 * Schema validation helpers.
 * @see https://stack.convex.dev/argument-validation-without-repetition
 */
export {
  nullable,
  partial,
  literals,
  brandedString,
} from 'convex-helpers/validators'

/**
 * Consolidated validators from validators.ts
 */
export {
  // Branded string types
  emailValidator,
  urlValidator,
  slugValidator,
  // Common validators
  statusValidator,
  visibilityValidator,
  sortOrderValidator,
  // Field validators
  timestampFields,
  softDeleteFields,
  auditFields,
  paginationArgs as paginationArgsValidator, // Renamed to avoid conflict
  searchArgs,
  // User validators
  publicUserProfileValidator,
  fullUserValidator,
  paginatedUsersValidator,
  // Validation constants and functions
  FIELD_LIMITS,
  validateFirstName,
  validateLastName,
  validateBio,
  validateEmail,
  combineNames,
} from './validators'

// ============================================================================
// Custom Functions
// ============================================================================

/**
 * Build custom query/mutation/action wrappers.
 * @see https://stack.convex.dev/custom-functions
 */
export {
  customQuery,
  customMutation,
  customAction,
  customCtx,
  NoOp,
} from 'convex-helpers/server/customFunctions'

// ============================================================================
// Row-Level Security
// ============================================================================

/**
 * Database access control at the row level.
 * @see https://stack.convex.dev/row-level-security
 */
export {
  wrapDatabaseReader,
  wrapDatabaseWriter,
  type Rules,
  type RLSConfig,
} from 'convex-helpers/server/rowLevelSecurity'

// ============================================================================
// Filter Helper
// ============================================================================

/**
 * Apply TypeScript filters to database queries.
 * @see https://stack.convex.dev/complex-filters-in-convex
 */
export { filter } from 'convex-helpers/server/filter'

// ============================================================================
// Role-Based Access Control (RBAC)
// ============================================================================

/**
 * RBAC helpers for admin and moderator-only endpoints.
 * @see convex/security.ts for implementation details
 */
export {
  adminOnlyQuery,
  adminOnlyMutation,
  moderatorQuery,
  moderatorMutation,
} from './security'

// ============================================================================
// Error Handling
// ============================================================================

/**
 * Structured error codes and factory functions.
 * @see convex/errors.ts for full list
 */
export {
  ErrorCode,
  createError,
  authenticationRequired,
  forbidden,
  adminRequired,
  notFound,
  alreadyExists,
  validationError,
  rateLimited,
  isAppError,
  hasErrorCode,
  getErrorMessage,
} from './errors'

// ============================================================================
// Rate Limiting Utilities
// ============================================================================

/**
 * Rate limiter instance and helpers.
 * Uses @convex-dev/rate-limiter component.
 * @see convex/rateLimit.ts for usage
 */
export {
  // Time constants
  SECOND,
  MINUTE,
  HOUR,
  DAY,
  WEEK,
  // Error handling
  isRateLimitError,
  // Rate limiter instance
  rateLimiter,
  // Helper functions
  rateLimitWithThrow,
  checkLimit,
  consumeLimit,
  consumeWithReserve,
  resetLimit,
  getRateLimitValue,
  calculateRetryDelay,
  // React hook API
  getUserActionRateLimit,
  getApiReadRateLimit,
  getServerTime,
} from './rateLimit'

// ============================================================================
// Triggers & Audit Logs
// ============================================================================

/**
 * Database triggers for reactive updates.
 * @see convex/triggers.ts
 */
export {
  triggers,
  mutationWithTriggers,
  authMutationWithTriggers,
  optionalAuthMutationWithTriggers,
  listAuditLogs,
  getAuditLogsForUser,
} from './triggers'

// ============================================================================
// Zod Validation
// ============================================================================

/**
 * Zod-validated query and mutation builders.
 * @see convex/zodFunctions.ts
 */
export {
  zodQuery,
  zodMutation,
  emailSchema,
  passwordSchema,
  usernameSchema,
  urlSchema,
  paginationSchema,
  userProfileSchema,
  searchSchema,
  zid,
} from './zodFunctions'

// ============================================================================
// Pagination
// ============================================================================

/**
 * Advanced pagination utilities.
 * @see convex/pagination.ts
 */
export {
  paginationArgs,
  paginateUsers,
  createPaginationHandler,
  encodeCursor,
  decodeCursor,
  validateLimit,
} from './pagination'

// ============================================================================
// Types
// ============================================================================

export type { Expand, BetterOmit } from 'convex-helpers'
export type { AppErrorData } from './errors'
export type { PaginationResult } from './pagination'
