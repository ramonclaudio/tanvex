# tanstack-convex-starter

Minimal starter. TanStack Start + Convex + Better Auth.

## Quick Start

```bash
bun install
bun run setup
bun run dev
```

For local Convex backend (optional):
```bash
bun run setup:local
bunx convex dev --local  # keep running in terminal 1
bun run dev              # run in terminal 2
```

## Stack

**Frontend:**
- [TanStack Start](https://tanstack.com/start) - Full-stack React framework
- [TanStack Router](https://tanstack.com/router) - Type-safe routing
- [TanStack Query](https://tanstack.com/query) - Data fetching & caching
- [React 19](https://react.dev) - UI library
- [Tailwind CSS v4](https://tailwindcss.com) - Styling
- [shadcn/ui](https://ui.shadcn.com) - UI components
- [Zod](https://zod.dev) - Schema validation

**Backend:**
- [Convex](https://convex.dev) - Backend platform (database, functions, file storage)
- [Better Auth](https://better-auth.com) - Authentication (via `@convex-dev/better-auth`)
- [convex-helpers](https://github.com/get-convex/convex-helpers) - Utilities (RLS, triggers, custom functions)
- [@convex-dev/rate-limiter](https://github.com/get-convex/rate-limiter) - Rate limiting component

## Project Structure

```
├── src/
│   ├── components/      # React components (UI, nav, theme)
│   ├── hooks/           # Custom React hooks
│   ├── lib/             # Client utilities (auth, convex)
│   ├── routes/          # TanStack Router file-based routes
│   └── styles.css       # Global styles
├── convex/
│   ├── auth.ts          # Better Auth setup & user helpers
│   ├── schema.ts        # Database schema
│   ├── functions.ts     # Custom auth query/mutation wrappers
│   ├── security.ts      # Row-level security & RBAC
│   ├── rateLimit.ts     # Rate limiting configuration
│   ├── triggers.ts      # Database triggers & audit logs
│   ├── users.ts         # User CRUD operations
│   ├── http.ts          # HTTP API endpoints
│   └── helpers.ts       # Centralized exports
├── scripts/
│   └── setup.ts         # Project setup script
└── public/              # Static assets
```

## Available Scripts

```bash
bun run setup        # Setup Convex (cloud)
bun run setup:local  # Setup Convex (local backend)
bun run dev          # Start development server
bun run build        # Build for production
bun run serve        # Preview production build
bun run test         # Run tests
bun run lint         # Run ESLint
bun run format       # Run Prettier
bun run check        # Format + lint fix
bun run clean        # Remove node_modules, dist, lockfile & reinstall
```

## Environment Variables

The setup script automatically configures environment variables. For reference:

**Local development** (`.env.local` - auto-generated):
```bash
CONVEX_DEPLOYMENT=dev:your-project-name
VITE_CONVEX_URL=https://your-project-name.convex.cloud
VITE_CONVEX_SITE_URL=https://your-project-name.convex.site
```

**Production** - Set in your hosting provider (Vercel/Netlify):
```bash
CONVEX_DEPLOYMENT=prod:your-project-name
SITE_URL=https://your-app.vercel.app
```

**Production** - Set in Convex Dashboard (or via CLI):
```bash
SITE_URL=https://your-app.vercel.app
BETTER_AUTH_SECRET=<generated-secret>
```

## Deploy

1. **Set Convex production environment variables:**
```bash
bunx convex env set SITE_URL https://your-app.vercel.app --prod
bunx convex env set BETTER_AUTH_SECRET $(openssl rand -base64 32) --prod
```

2. **Deploy to Convex:**
```bash
bunx convex deploy --cmd "bun run build"
```

3. **Set hosting provider environment variables** (Vercel/Netlify):
```
CONVEX_DEPLOYMENT=prod:your-project-name
SITE_URL=https://your-app.vercel.app
```

## Features

- **Authentication** - Email/password, OAuth (Google, GitHub), session management
- **User Management** - Profiles, avatars, usernames
- **Row-Level Security** - Database access control
- **Role-Based Access** - Admin/moderator roles
- **Rate Limiting** - Token bucket & fixed window algorithms
- **Audit Logging** - Track user actions
- **SSR Support** - Server-side rendering with TanStack Start

## License

MIT
