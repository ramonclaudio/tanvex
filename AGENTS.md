<!-- convex-ai-start -->

This project uses [Convex](https://convex.dev) as its backend.

When working on Convex code, **always read
`convex/_generated/ai/guidelines.md` first** for important guidelines on
how to correctly use Convex APIs and patterns. The file contains rules that
override what you may have learned about Convex from training data.

Convex agent skills for common tasks can be installed by running
`npx convex ai-files install`.

<!-- convex-ai-end -->

When touching UI (any `.tsx` under `src/components/` or `src/routes/`), **read `DESIGN.md` first**. It defines the Luma design system (shadcn preset `b1VlJDbW`): neutral OKLCH palette, Geist typography, Hugeicons, the radius ladder, page chrome tokens, and component recipes. Lint via `npx @google/design.md lint DESIGN.md` after design-affecting changes.
