# Dependency patches

Applied by bun via `patchedDependencies` in `package.json`. The key pins an exact
version, so a version bump silently stops applying the patch — re-evaluate the
patch whenever the dependency it names is upgraded.

## @storybook/tanstack-react

The framework replaces every `@tanstack/react-router` import inside Storybook
with its own mock, and the mock's `Link` stub spreads all router-only props
(`activeProps`, `params`, `search`, …) onto a plain `<a>`. That leaks unknown
props into the DOM (React logs `React does not recognize the 'activeProps'
prop…` on every render of components like `SiteNavigation`) and never applies
active-link styling in stories. Still broken upstream as of 10.5.8.

The patch rewrites the stub to consume the router-only prop set, apply
`activeProps`/`inactiveProps` when the link matches the current location,
support function-form `children`, and let a caller's `onClick` cancel the mock
navigation — mirroring the real `Link`'s semantics.

Fixed upstream by <https://github.com/storybookjs/storybook/pull/35505>
(merged to `next` 2026-08-12, ships with the 10.6 line — not cherry-picked to
10.5.x). Drop this patch when upgrading to a release that contains it; until
then, regenerate on any 10.5.x bump (`bun patch @storybook/tanstack-react`,
re-apply, `bun patch --commit`).
Verify either way by loading the `shell-appheader--default-header` story — the
console must be free of unknown-prop warnings and `bun run storybook:test` must
pass.
