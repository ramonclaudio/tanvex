# Patches

Currently empty, and that is the goal state. Any `*.patch` file dropped in this
directory is applied to `node_modules` by `scripts/apply-patches.mjs` on every
install (the `postinstall` script), so the mechanism stays available for forks
that need to carry a temporary upstream fix.

If you add a patch: pin the patched package to an exact version in
`package.json` (the patch targets a specific dist), and record here what it
changes, the upstream issue or commit, and the condition for deleting it.

History: this template previously carried a better-auth change-password
backport (dropped when the app moved to stock 1.6.23 and a local auth bridge)
and an @hugeicons/react type patch (replaced by the ambient declaration in
`src/hugeicons.d.ts`).
