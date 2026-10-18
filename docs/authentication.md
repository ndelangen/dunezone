# Authentication

## Auth flow

```mermaid
flowchart TD
    User[User] --> Login["Login Page<br/>/auth/login"]
    Login --> ConvexAuth[Convex Auth]
    ConvexAuth --> UsersRow["users row created/updated"]
    UsersRow --> ProfileRow["profiles row ensured"]
    ConvexAuth --> Session[Session Created]
    Session --> Mutations[Mutations Check Auth]
    Mutations --> DB[(Database)]

    OAuth[OAuth Provider] --> ConvexAuth
```

Convex Auth handles authentication. Domain mutations enforce authorization inside Convex functions.

Stored sessions are checked alongside the signed identity. Revoked sessions cannot read owner-only
data or start account deletion. Mutations reject both absolute and idle session expiry immediately.
Each new session receives a scheduled expiry job, and a one-time migration registers existing
sessions. The job rechecks refreshed deadlines and removes expired sessions and refresh credentials
in bounded batches. There is no recurring authentication poll. Queries never read the clock and
lose private access when the job removes the session. A delayed job can therefore allow new private
reads until removal; mutations and Play enforce their deadlines independently. An unexpired JWT
retains ordinary account access when its refresh branch has been invalidated, until session cleanup
or JWT expiry. Play requires an unused refresh token.

Disconnecting a provider revokes every existing session for the account. A revocation checkpoint
blocks private reads, writes and token refresh before asynchronous cleanup finishes. A later sign-in
with a remaining provider creates a usable session. The profile edit page clears its local tokens
after disconnection.

## Convex Auth

Production sign-in starts at `https://dune.zone/auth/signin/google` or
`https://dune.zone/auth/signin/discord`. Providers return to `/auth/callback/google`
and `/auth/callback/discord` on the same origin. The publisher Worker forwards
those paths to Convex Auth's `/api/auth` handlers. `/api` on dune.zone stays available
for future application APIs.

`convex/auth.production.env` sets the public origin and path together after the
Worker deploys and passes its smoke checks. `CUSTOM_AUTH_SITE_URL` is Convex Auth's
documented origin override. The pinned `@convex-dev/auth` patch adds
`CUSTOM_AUTH_PATH` to its two URL builders, defaulting to the library's `/api/auth`
path when absent. Both compiled JavaScript and TypeScript source carry the patch;
remove it when upstream supports a public path override. Backend HTTP routes keep
their existing paths.

The routing gate checks that sign-in accepts GET only and that both providers'
cancellation callbacks redirect home without caching. These probes need no credentials
and create no accounts. A sign-in request with no verifier is unsuitable as a probe:
the pinned library reports it as a server error.

The token issuer, signing keys, auth tables and Convex client URL remain unchanged.
Existing sessions can refresh through the same backend. Keep each provider's old
callback registration for rollback. Removing the two `CUSTOM_AUTH_*` variables
returns new sign-ins to the Convex address; a sign-in already in progress during
either switch may need to restart.

The auth proxy forwards only the selected provider's OAuth cookies, preserves
individual `Set-Cookie` headers and browser redirects, and never caches responses.
Its handler does not log request URLs, codes or cookies. Platform request logging
is separate from handler logging.

Google and Discord share the approved site icon and the name "Dune Zone". Discord's
description is "Homebrew tools for the Dune board game." The exports live in
[`technical/auth-domain-branding/`](technical/auth-domain-branding/); their source
is [`public/dune-zone-favicon.svg`](../public/dune-zone-favicon.svg). Google's
published display name and logo depend on its brand-verification status.

Discord also lists the support address and links to the privacy page.
Both providers use `https://dune.zone/privacy` for their privacy and Terms of Service
links; that page includes the conduct, copyright and service terms. Google's private
developer-contact notices also use the support address.
`support@dune.zone` is the public contact for support and privacy questions. Cloudflare
Email Routing forwards it to the existing verified owner inbox. The old
`requests@dune.zone` address remains a compatibility alias through the existing Email
Worker, which forwards to the same inbox without reading the message. The site's
footer and privacy page use only the support address.

Google's public support-email selector accepts a Google account or a managed Google
Group, rather than an arbitrary forwarding address. Its existing owner Gmail address
remains selected until a Google identity for the support address is available.

**Client**: [`src/app/db/core/index.ts`](../src/app/db/core/index.ts)

```typescript
export const convex = new ConvexReactClient(import.meta.env.VITE_CONVEX_URL!);
```

## Authentication in mutations

Auth is enforced server-side in Convex mutations:

```typescript
const userId = await requireAuthUserId(ctx);
```

**Examples**: [`convex/members.ts`](../convex/members.ts), [`convex/profiles.ts`](../convex/profiles.ts)

## Auth routes

The visual auth routes live under the `_app` layout, so they carry application chrome; only the
non-visual hand-off sits outside it:

- `_app/auth/login.route.tsx` → `/auth/login` - Login form
- `_app/auth/error.route.tsx` → `/auth/error` - Auth error page
- `_app/auth/index.tsx` → `/auth` - Auth landing
- `auth/oauth.route.tsx` → `/auth/oauth` - Legacy compatibility redirect, outside `_app`

## Profiles

A `profiles` document is created in Convex when an auth user is created or updated: `callbacks.afterUserCreatedOrUpdated` in [`convex/auth.ts`](../convex/auth.ts) calls `ensureProfileForUser` (see [`convex/lib/profileBootstrap.ts`](../convex/lib/profileBootstrap.ts)) using the patched `users` row (`name`, `image`).

If a legacy user has no profile, the client's `useCurrentProfile()` calls `profiles.bootstrapCurrent` once when `profiles.session` returns a `userId` whose `profile` is still `null`. For bulk repair, missing profiles are backfilled by the **`profiles_from_users_v1`** Convex migration (see [`convex/migrations.ts`](../convex/migrations.ts)), which runs with the rest of the widen migrations via `bun run migrations:deploy` / `bun run migrations:dev-strict` and appears on [`/admin/migrations`](../src/app/routes/_app/admin/migrations.route.tsx).

**Hooks**: `useCurrentProfile()`, `useDefaultGroupPreference()`, `useProfileBySlug(slug)`,
`useProfileDirectoryPage(args)`, `useUpdateCurrentProfile()`. Profile lookups are slug-based, never by id.

**Example**: [`src/app/db/profiles.ts`](../src/app/db/profiles.ts)

## Connected sign-in methods and merges

A profile may also have a public BoardGameGeek profile link, edited in the Profile tab and saved
with the rest of the draft. Its ownership is unverified. It cannot sign anyone in, satisfy the
last-method guard or authorize a profile merge. Clearing the URL and saving removes the link.
Only HTTPS BoardGameGeek user-profile URLs are accepted; saves remove query strings and fragments.
The kept profile retains its own link during a merge.

The profile owner manages Google and Discord in the Sign-in methods tab on the profile edit page.
They can connect an available provider, or disconnect one while another configured provider remains connected. Disconnection uses the kit's hold-to-remove action. The last-method check runs in the disconnect transaction. Disconnecting signs the account out on every device. Account
deletion remains on the profile's deletion page.

Connecting starts with an authenticated, unexpired session. The server issues a random connection
credential, stores only its digest, and caps its lifetime at ten minutes and the session's expiration.
After OAuth, a fresh session proves control of the other account. Convex Auth replaces the original
session during this login, so the saved intent carries the first proof. The original account must
still be active. The user reviews the two profiles before confirming the merge, and each intent can
be accepted once. Its progress credential expires at the same ten-minute deadline, including after
a completed or failed merge. The deployment backfill expires older accepted credentials whose
deadlines have already passed. Failure details stay in the administrator view. The original profile keeps its name, avatar, address and preferences.

Administrators can choose which profile to keep at `/_admin/accounts`. Both accounts must be active,
and neither may participate in an unfinished merge or ownership transfer from account deletion.
The source account stops accepting writes. Indexed batches transfer credentials, ownership,
memberships and contributions. A failed batch rolls back before the job records failure; an admin
can resume it. The source's sessions are revoked, and its old profile address resolves to the kept
profile. Merges cannot be undone through the product.

Play retains historical actor identities and authorizes them through the kept account's session.
Routing records preserve at most 32 actor identities per game. Account deletion reaches every
retained identity. A merge refuses two occupied seats in the same ongoing game, more than 200
source routing or creation records, and a source game whose provisioning has not finished.

Publication jobs now live at `/_admin/jobs`. The former `/__jobs` address and `/_jobs` redirect there.

### Recover a failed merge

A failed merge remains locked because earlier batches may already have transferred content. There
is no safe cancellation by clearing the locks: overlapping memberships are combined and duplicate
routing rows are removed. Recovery completes the transfer into the chosen profile.

1. Open `/_admin/accounts` with an administrator account. Read the failed job's error, and inspect
   its `account_merge_operations` record in the Convex dashboard. Its `phase` identifies the next
   batch in `MERGE_BATCHES` in `convex/lib/accountMerge.ts`.
2. Inspect the Convex error log for `accounts:advanceBatch` and the named batch. For a deterministic
   code or validation failure, fix its cause and deploy that correction through the normal review
   and CI gates. Preserve the stored phase numbers, profile aliases and game actor identities. Do
   not skip the failing batch, clear account locks or move already-transferred rows back.
3. Select **Retry merge** in Accounts. Each batch drains the remaining indexed source rows, so
   completed batches stay completed and a partially completed phase continues with its remaining
   rows. The failed batch's transaction has rolled back before the failure was recorded.
4. Wait for **Completed**, then verify both sign-in accounts reach the kept profile, the old profile
   address redirects, and the transferred content appears. Completion revokes source sessions and
   removes the account-management locks. If the same error recurs, retain the lock and return to
   step 2 rather than repeatedly retrying the same deterministic failure.

The kept account stays active while recovery is pending; its existing sign-in method and ordinary
content access remain available. An administrator who is merging their own profile retains admin
access on the kept account and can sign in with that account's existing method to resume the job.
