# Patches

Applied to `node_modules` by `scripts/apply-patches.mjs` on every install (the
`postinstall` script). Each patched package is pinned to an exact version in
`package.json` so the patch always targets the dist it was generated against.

## `better-auth+1.6.9.patch`

Backports the upstream fix for `POST /change-password` with
`revokeOtherSessions: true`. Stock 1.6.9 deletes every session including the
current one, mints a replacement session, and returns its token, which forces a
client-side re-auth dance right after a password change. The patched behavior
keeps the current session, deletes only the other non-expired sessions, and
returns `token: null` (upstream commit `2612e4f` on the better-auth main branch).
The `.d.mts` hunks narrow the response type to match.

Why not upgrade instead: the fix is not in any stable release. Verified against
the published `better-auth@1.6.23` tarball, whose `changePassword` still revokes
the current session. It lands in the 1.7 line.

Remove when: `better-auth` 1.7 ships stable and the app upgrades to it. At that
point delete this patch, unpin `better-auth`, and re-check that
`@convex-dev/better-auth`'s peer range covers the new version before unpinning it
too. The two pins move together.
