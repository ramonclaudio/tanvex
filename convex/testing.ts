/**
 * Testing Utilities
 *
 * Helpers for testing Convex functions with simulated authentication.
 * Use with vitest for unit and integration tests.
 *
 * @see https://stack.convex.dev/testing-with-convex
 */

import { ConvexTestingHelper } from "convex-helpers/testing";

// ============================================================================
// Test Helper Instance
// ============================================================================

/**
 * Create a testing helper connected to a local Convex backend.
 *
 * @example
 * import { createTestHelper, mockUser } from './testing';
 *
 * describe('users', () => {
 *   const t = createTestHelper();
 *
 *   afterAll(() => t.close());
 *
 *   it('should get current user', async () => {
 *     const identity = mockUser({ email: 'test@example.com' });
 *     const result = await t.withIdentity(identity).query(api.users.getMe, {});
 *     expect(result.email).toBe('test@example.com');
 *   });
 * });
 */
export function createTestHelper(options?: {
  /**
   * URL of the Convex backend.
   * Default: http://127.0.0.1:3210
   */
  backendUrl?: string;
  /**
   * Admin key for the local backend.
   * Default: 0135d8598f4d6fbe1bf5a2b52ad3b846823f69a9f10ae0e58dd9adc8e8fe0c0c
   */
  adminKey?: string;
}) {
  return new ConvexTestingHelper({
    backendUrl: options?.backendUrl ?? "http://127.0.0.1:3210",
    adminKey:
      options?.adminKey ?? "0135d8598f4d6fbe1bf5a2b52ad3b846823f69a9f10ae0e58dd9adc8e8fe0c0c",
  });
}

// ============================================================================
// Mock User Identity
// ============================================================================

/**
 * Create a mock user identity for testing authenticated functions.
 *
 * @example
 * const admin = mockUser({
 *   email: 'admin@example.com',
 *   name: 'Admin User',
 *   role: 'admin',
 * });
 */
export function mockUser(
  options: {
    email?: string;
    name?: string;
    subject?: string;
    issuer?: string;
    tokenIdentifier?: string;
  } = {},
) {
  const email = options.email ?? "test@example.com";
  const name = options.name ?? "Test User";
  const subject = options.subject ?? `user_${Date.now()}`;
  const issuer = options.issuer ?? "https://test-issuer.example.com";
  const tokenIdentifier = options.tokenIdentifier ?? `${issuer}|${subject}`;

  return {
    subject,
    issuer,
    tokenIdentifier,
    email,
    name,
    // Add any other claims needed for testing
  };
}

/**
 * Create an admin user identity for testing admin-only functions.
 */
export function mockAdmin(options: Parameters<typeof mockUser>[0] = {}) {
  return mockUser({
    ...options,
    email: options.email ?? "admin@example.com",
    name: options.name ?? "Admin User",
  });
}

/**
 * Create a moderator user identity for testing moderator functions.
 */
export function mockModerator(options: Parameters<typeof mockUser>[0] = {}) {
  return mockUser({
    ...options,
    email: options.email ?? "mod@example.com",
    name: options.name ?? "Moderator User",
  });
}

// ============================================================================
// Test Data Factories
// ============================================================================

/**
 * Create test user data for inserting into the database.
 */
export function createTestUserData(
  overrides: Partial<{
    email: string;
    name: string;
    avatar: string | null;
    bio: string;
    role: "user" | "admin" | "moderator";
  }> = {},
) {
  return {
    email: overrides.email ?? `test-${Date.now()}@example.com`,
    name: overrides.name ?? "Test User",
    avatar: overrides.avatar ?? null,
    bio: overrides.bio ?? undefined,
    role: overrides.role ?? "user",
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
}

// ============================================================================
// Test Assertions
// ============================================================================

/**
 * Assert that a function throws a ConvexError with expected data.
 */
export async function expectConvexError<T>(
  promise: Promise<T>,
  expectedCode?: string,
  expectedMessage?: string | RegExp,
): Promise<void> {
  try {
    await promise;
    throw new Error("Expected function to throw, but it did not");
  } catch (error: any) {
    // Check if it's a Convex error response
    if (error.data) {
      if (expectedCode && error.data.code !== expectedCode) {
        throw new Error(`Expected error code "${expectedCode}" but got "${error.data.code}"`);
      }
      if (expectedMessage) {
        const message = error.data.message;
        if (typeof expectedMessage === "string" && message !== expectedMessage) {
          throw new Error(`Expected error message "${expectedMessage}" but got "${message}"`);
        }
        if (expectedMessage instanceof RegExp && !expectedMessage.test(message)) {
          throw new Error(
            `Expected error message to match ${expectedMessage} but got "${message}"`,
          );
        }
      }
      return;
    }

    // Re-throw non-Convex errors
    throw error;
  }
}

/**
 * Assert that a promise resolves successfully.
 */
export async function expectSuccess<T>(promise: Promise<T>): Promise<T> {
  try {
    return await promise;
  } catch (error: any) {
    const message = error.data?.message ?? error.message ?? "Unknown error";
    throw new Error(`Expected function to succeed, but it threw: ${message}`);
  }
}

// ============================================================================
// Cleanup Helpers
// ============================================================================

/**
 * Helper to clean up test data after tests.
 * Use in afterEach or afterAll hooks.
 */
export async function cleanupTestData(
  _t: ReturnType<typeof createTestHelper>,
  tableName: string,
  _filter: (doc: any) => boolean,
): Promise<void> {
  // This would require a mutation to delete matching documents
  // For now, log a warning - implement based on your needs
  console.warn(
    `cleanupTestData: Manual cleanup needed for ${tableName}. ` +
      "Consider using a test database or implementing a cleanup mutation.",
  );
}
