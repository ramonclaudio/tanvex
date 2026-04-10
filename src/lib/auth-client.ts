import { convexClient } from '@convex-dev/better-auth/client/plugins'
import { createAuthClient } from 'better-auth/react'
import { emailOTPClient, usernameClient } from 'better-auth/client/plugins'

export const authClient = createAuthClient({
  plugins: [convexClient(), usernameClient(), emailOTPClient()],
})
