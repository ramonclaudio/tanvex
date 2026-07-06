import { ConvexProviderWithAuth } from "convex/react"
import type { ConvexReactClient } from "convex/react"
import { useCallback, useMemo, useRef } from "react"
import type { ReactNode } from "react"

import { authClient } from "@/lib/auth-client"

/**
 * Better Auth → Convex bridge.
 *
 * Replaces `ConvexBetterAuthProvider` from `@convex-dev/better-auth/react`,
 * which has two bugs and a type problem:
 *
 *  1. Its `fetchAccessToken` is keyed on the session id, so a session change
 *     rebuilds the fetcher, which makes `ConvexProviderWithAuth` tear down and
 *     re-run auth. Under session refetches this churns `useConvexAuth`.
 *  2. Its `cachedToken` state is read through a `useMemo` hook factory that
 *     only re-runs when the auth client changes (never), so the inner hook
 *     closes over the first render's value forever. After sign-out the stale
 *     token can keep `isAuthenticated` true until a full remount.
 *  3. Its `AuthClient` prop type does not accept clients built against
 *     better-auth 1.6.23 (`useSession().data` collapses to `never`).
 *
 * This bridge does what the platform needs and nothing else:
 *  - `isAuthenticated` / `isLoading` derive from `authClient.useSession()` in
 *    render, no cached closures. The SSR-minted `initialToken` is trusted
 *    until the client session resolves, so authed chrome renders immediately
 *    and hydration matches the server markup.
 *  - `fetchAccessToken` is identity-stable. The Convex client caches the JWT
 *    internally and re-calls only on expiry or forceRefresh. In-flight calls
 *    de-dup via a ref. The SSR token is served once to save a round trip.
 *
 * The upstream provider's `?ott=` handling is for cross-domain deployments;
 * this app proxies auth same-origin, so it has no OTT flow to handle.
 */
function useBetterAuthForConvex(initialToken: string | null) {
  const { data: session, isPending } = authClient.useSession()
  const initialTokenRef = useRef(initialToken)
  const inflightRef = useRef<Promise<string | null> | null>(null)

  const fetchAccessToken = useCallback(
    async ({ forceRefreshToken = false }: { forceRefreshToken?: boolean } = {}) => {
      if (!forceRefreshToken && initialTokenRef.current) {
        const token = initialTokenRef.current
        initialTokenRef.current = null
        return token
      }
      if (!forceRefreshToken && inflightRef.current) return inflightRef.current

      const promise = authClient.convex
        .token({ fetchOptions: { throw: false } })
        .then(({ data }) => data?.token ?? null)
        .catch(() => null)
        .finally(() => {
          inflightRef.current = null
        })
      inflightRef.current = promise
      return promise
    },
    [],
  )

  const isAuthenticated = !!session?.session || (isPending && initialToken !== null)
  const isLoading = isPending && initialToken === null

  return useMemo(
    () => ({ isLoading, isAuthenticated, fetchAccessToken }),
    [isLoading, isAuthenticated, fetchAccessToken],
  )
}

export function BetterAuthConvexProvider({
  children,
  client,
  initialToken,
}: {
  children: ReactNode
  client: ConvexReactClient
  initialToken?: string | null
}) {
  // First value wins: __root's beforeLoad re-runs on every navigation and
  // mints a fresh JWT string each time. Rebuilding useAuth on each of those
  // would re-trigger ConvexProviderWithAuth's auth cycle (the exact churn
  // this bridge exists to avoid). The seed only matters before the client
  // session resolves, so later values carry no information.
  const initialTokenRef = useRef(initialToken ?? null)
  const useAuth = useMemo(
    () =>
      function useAuthBridge() {
        return useBetterAuthForConvex(initialTokenRef.current)
      },
    [],
  )
  return (
    <ConvexProviderWithAuth client={client} useAuth={useAuth}>
      {children}
    </ConvexProviderWithAuth>
  )
}
