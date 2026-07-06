# Architecture

System-level views of how the pieces connect. Implementation detail lives in the source,
starting from `convex/functions.ts` (the wrapper layer) and `src/routes/__root.tsx`
(the app shell).

## Overall

Three runtimes plus one external service. The browser talks to the Start server for
HTML and auth, and to Convex directly for data. Convex owns all state and secrets.

```mermaid
flowchart LR
    subgraph Browser
        R[React 19 + TanStack Router]
        AC[Better Auth client]
    end

    subgraph Start["TanStack Start SSR (Nitro)"]
        SSR[route loaders + beforeLoad]
        PROXY["/api/auth/$ proxy"]
    end

    subgraph Convex["Convex deployment"]
        FN[queries / mutations]
        HTTP["HTTP router (convex.site)"]
        BA[[better-auth component]]
        RL[[rate-limiter component]]
        RS[[resend component]]
        DB[(tables + storage)]
    end

    RES[Resend]

    R -- websocket queries/mutations --> FN
    R -- HTML / SSR --> SSR
    AC -- "/api/auth/*" --> PROXY
    PROXY --> HTTP
    SSR -- authed fetch --> FN
    HTTP --> BA
    FN --> DB
    BA --> DB
    FN --> RL
    RS -- send email --> RES
    RES -- delivery webhook --> HTTP
    HTTP -- events --> RS
```

- The browser never holds secrets. `VITE_*` vars are public URLs baked at build time.
- `BETTER_AUTH_SECRET`, `RESEND_API_KEY`, `SITE_URL`, and friends live on the Convex
  deployment only.
- The auth proxy keeps browser-to-auth traffic same-origin, so no CORS on the auth
  routes. The CORS allowlist (`convex/origins.ts`) applies to the public `/api/*`
  endpoints only.

## Data flow and rate limiting

Every write path consumes a rate-limit bucket before touching data. Reads over the
websocket are Convex-reactive and unmetered. Anonymous reads go through the HTTP API,
which meters by IP.

```mermaid
flowchart TD
    subgraph Client
        U[authed user]
        A[anonymous caller]
    end

    subgraph Convex
        W{"wrappers (convex/functions.ts)<br/>authQuery / authMutation / optionalAuthQuery"}
        M[users.updateProfile<br/>users.updateAvatar<br/>users.deleteAvatar<br/>users.generateAvatarUploadUrl]
        Q[users.getMe]
        H["/api/users, /api/users/list"]
        C[checkApiRateLimit]
        I[internal.users.getUser<br/>internal.users.listUsers]
        RL[[rate-limiter component]]
        DB[(users table + _storage)]
    end

    U -- mutation --> W --> M
    M -- "userAction bucket, key = user id" --> RL
    M --> DB
    U -- query --> W --> Q --> DB
    A -- GET --> H
    H -- "apiRead bucket, key = client IP" --> C --> RL
    H --> I --> DB
```

- `getUser` and `listUsers` are `internal.*`. Their only entry is the rate-limited HTTP
  route, so the IP meter cannot be bypassed over the websocket.
- Better Auth applies its own HTTP rate limits to the auth routes (sign-in, sign-up,
  OTP sends) in `convex/auth.ts`. The rate-limiter component covers app endpoints.
- Avatar bytes go browser to Convex storage directly via a short-lived upload URL
  minted by `generateAvatarUploadUrl` (itself rate limited).

## Auth flow

Sign-up through Convex-side enforcement. The `_authed` route gate is UX only. The
authority is the wrapper layer inside Convex, which resolves the session from the
better-auth component on every call.

```mermaid
sequenceDiagram
    participant B as Browser
    participant S as Start server
    participant C as Convex (better-auth)
    participant R as Resend

    B->>S: POST /api/auth/sign-up/email
    S->>C: proxy
    C->>C: create user + trigger inserts app users row
    C->>R: OTP email (resend component)
    R-->>B: email with 6-digit code
    B->>S: POST /api/auth/email-otp/verify-email
    S->>C: proxy
    C->>C: verify OTP, mint session (autoSignInAfterVerification)
    C-->>B: session cookie (same-origin via proxy)

    Note over B,S: later: any SSR navigation
    B->>S: GET /profile (cookie)
    S->>C: getToken exchanges cookie for a Convex JWT
    S->>S: __root beforeLoad stores token in router context
    S->>S: _authed beforeLoad redirects to /sign-in if no token (UX only)
    S->>C: loader fetchAuthQuery(users.getMe) with JWT
    C->>C: wrapper resolves session in the component, rejects if dead
    C-->>S: user or AUTH_1001
    S-->>B: rendered page + token for the live client
    B->>C: websocket authenticates with the same JWT
```

- Password sign-in, username sign-in, and OTP sign-in all land on the same session
  machinery. OTP sign-in cannot create accounts (`disableSignUp`).
- Session cookies live on the app origin because the browser only ever talks to
  `/api/auth/*` on the Start server.
- Every Convex function that needs a user goes through
  `requireAuthenticatedUser` / `safeGetAuthenticatedUser`, which validate the session
  against the better-auth component's tables on each call. A revoked session fails
  server-side regardless of what the client claims.

## Route tree

```mermaid
flowchart TD
    ROOT["__root<br/>shell: header, theme, toaster<br/>beforeLoad: token into context"]
    IDX["/ (index)"]
    SIGNIN["/sign-in<br/>redirects away when authed"]
    AUTHED["_authed (pathless)<br/>beforeLoad: redirect to /sign-in"]
    PROFILE["/profile<br/>loader preloads users.getMe"]
    API["/api/auth/$ (server route)<br/>GET/POST to Better Auth"]

    ROOT --> IDX
    ROOT --> SIGNIN
    ROOT --> AUTHED --> PROFILE
    ROOT --> API
```

- `defaultPreload: "intent"` preloads route code and loaders on hover/focus.
- `routeTree.gen.ts` is generated by the router plugin. Do not edit it.
