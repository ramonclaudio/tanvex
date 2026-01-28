/**
 * Convex Query Cache Provider
 *
 * Provides client-side caching for Convex queries to reduce
 * unnecessary re-computations within the same render cycle.
 *
 * @see https://stack.convex.dev/caching-queries-on-the-client
 */

import { ConvexQueryCacheProvider } from 'convex-helpers/react/cache/provider'
import type { ReactNode } from 'react'

interface ConvexCacheProps {
  children: ReactNode
  /**
   * How long to keep unmounted query subscriptions alive (in milliseconds).
   * Default: 5 minutes (300000ms)
   */
  expiration?: number
  /**
   * Maximum number of idle cached queries to keep.
   * Default: 250
   */
  maxIdleEntries?: number
  /**
   * Enable debug logging (logs cache state every 3 seconds).
   * Default: false
   */
  debug?: boolean
}

/**
 * Wrap your app with this provider to enable query caching.
 *
 * @example
 * function App() {
 *   return (
 *     <ConvexCache expiration={60000} debug={process.env.NODE_ENV === 'development'}>
 *       <YourApp />
 *     </ConvexCache>
 *   );
 * }
 */
export function ConvexCache({
  children,
  expiration = 5 * 60 * 1000, // 5 minutes
  maxIdleEntries = 250,
  debug = false,
}: ConvexCacheProps) {
  return (
    <ConvexQueryCacheProvider
      expiration={expiration}
      maxIdleEntries={maxIdleEntries}
      debug={debug}
    >
      {children}
    </ConvexQueryCacheProvider>
  )
}

// Re-export cached hooks for convenience
export {
  useQuery,
  useQueries,
  usePaginatedQuery,
} from 'convex-helpers/react/cache/hooks'
