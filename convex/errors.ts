/**
 * Structured Error Codes
 *
 * Centralized error definitions for consistent client-side handling.
 * All errors extend ConvexError for proper serialization.
 *
 * @see https://docs.convex.dev/functions/error-handling
 */

import { ConvexError } from 'convex/values'

// ============================================================================
// Error Codes
// ============================================================================

/**
 * Standard error codes for the application.
 * Use these codes for consistent error handling on the client.
 */
export const ErrorCode = {
  // Authentication errors (1xxx)
  UNAUTHENTICATED: 'AUTH_1001',
  UNAUTHORIZED: 'AUTH_1002',
  SESSION_EXPIRED: 'AUTH_1003',
  INVALID_CREDENTIALS: 'AUTH_1004',
  ACCOUNT_DISABLED: 'AUTH_1005',
  EMAIL_NOT_VERIFIED: 'AUTH_1006',

  // Authorization errors (2xxx)
  FORBIDDEN: 'AUTHZ_2001',
  ADMIN_REQUIRED: 'AUTHZ_2002',
  MODERATOR_REQUIRED: 'AUTHZ_2003',
  OWNER_REQUIRED: 'AUTHZ_2004',

  // Validation errors (3xxx)
  VALIDATION_ERROR: 'VAL_3001',
  INVALID_INPUT: 'VAL_3002',
  MISSING_REQUIRED_FIELD: 'VAL_3003',
  INVALID_FORMAT: 'VAL_3004',

  // Resource errors (4xxx)
  NOT_FOUND: 'RES_4001',
  ALREADY_EXISTS: 'RES_4002',
  CONFLICT: 'RES_4003',
  GONE: 'RES_4004',

  // Rate limiting errors (5xxx)
  RATE_LIMITED: 'RATE_5001',
  TOO_MANY_REQUESTS: 'RATE_5002',

  // Server errors (9xxx)
  INTERNAL_ERROR: 'SRV_9001',
  SERVICE_UNAVAILABLE: 'SRV_9002',
  EXTERNAL_SERVICE_ERROR: 'SRV_9003',
} as const

export type ErrorCode = (typeof ErrorCode)[keyof typeof ErrorCode]

// ============================================================================
// Error Data Type
// ============================================================================

/**
 * Structured error data for ConvexError.
 * Client can parse this for user-friendly error handling.
 */
export type AppErrorData = {
  code: ErrorCode
  message: string
  field?: string // For validation errors
  retryAt?: number // For rate limiting
  details?: Record<string, string | number | boolean | null> // Additional context
}

// ============================================================================
// Error Factory Functions
// ============================================================================

/**
 * Create a structured ConvexError with error code.
 */
export function createError(
  code: ErrorCode,
  message: string,
  options?: { field?: string; retryAt?: number; details?: Record<string, string | number | boolean | null> }
) {
  return new ConvexError({
    code,
    message,
    ...options,
  } as AppErrorData)
}

// ============================================================================
// Convenience Error Creators
// ============================================================================

/**
 * Authentication required error.
 */
export function authenticationRequired(message = 'Authentication required') {
  return createError(ErrorCode.UNAUTHENTICATED, message)
}

/**
 * Authorization error - user doesn't have permission.
 */
export function forbidden(message = 'You do not have permission to perform this action') {
  return createError(ErrorCode.FORBIDDEN, message)
}

/**
 * Admin access required error.
 */
export function adminRequired(message = 'Admin access required') {
  return createError(ErrorCode.ADMIN_REQUIRED, message)
}

/**
 * Moderator access required error.
 */
export function moderatorRequired(message = 'Moderator access required') {
  return createError(ErrorCode.MODERATOR_REQUIRED, message)
}

/**
 * Resource not found error.
 */
export function notFound(resource = 'Resource', id?: string) {
  const message = id ? `${resource} with ID ${id} not found` : `${resource} not found`
  return createError(ErrorCode.NOT_FOUND, message, { details: { resource, id: id ?? null } })
}

/**
 * Resource already exists error.
 */
export function alreadyExists(resource: string, field?: string) {
  return createError(ErrorCode.ALREADY_EXISTS, `${resource} already exists`, {
    field,
    details: { resource },
  })
}

/**
 * Validation error.
 */
export function validationError(message: string, field?: string) {
  return createError(ErrorCode.VALIDATION_ERROR, message, { field })
}

/**
 * Rate limit exceeded error.
 */
export function rateLimited(retryAt: number, message = 'Too many requests') {
  return createError(ErrorCode.RATE_LIMITED, message, { retryAt })
}

/**
 * Invalid credentials error.
 */
export function invalidCredentials(message = 'Invalid email or password') {
  return createError(ErrorCode.INVALID_CREDENTIALS, message)
}

/**
 * Internal server error.
 */
export function internalError(message = 'An unexpected error occurred') {
  return createError(ErrorCode.INTERNAL_ERROR, message)
}

// ============================================================================
// Error Type Guards
// ============================================================================

/**
 * Check if an error is a ConvexError with our structured data.
 */
export function isAppError(error: unknown): boolean {
  return (
    error instanceof ConvexError &&
    typeof error.data === 'object' &&
    error.data !== null &&
    'code' in (error.data as object) &&
    'message' in (error.data as object)
  )
}

/**
 * Check if an error has a specific error code.
 */
export function hasErrorCode(error: unknown, code: ErrorCode): boolean {
  if (!isAppError(error)) return false
  const data = (error as ConvexError<AppErrorData>).data
  return data.code === code
}

/**
 * Get error message from any error type.
 */
export function getErrorMessage(error: unknown): string {
  if (isAppError(error)) {
    const data = (error as ConvexError<AppErrorData>).data
    return data.message
  }
  if (error instanceof Error) {
    return error.message
  }
  return 'An unexpected error occurred'
}
