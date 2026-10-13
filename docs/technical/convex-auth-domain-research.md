# Keeping authentication on dune.zone

Research checked on 13 October 2026. Source is freshly fetched `real-origin/main` at
`b1953f200fddcd9534c9744354413e56c3b549d1`. Production reported
`b716ef4b0c0faba06b18e71565b22ede090c7a12` during the investigation. The relevant auth
and Worker configuration match between those revisions. The research stage made no application or production changes.
Implementation was approved afterward, with public callbacks under `/auth/callback`
and the site icon shared by Google and Discord. See [authentication](../authentication.md)
for the implementation and rollout contract. The original research below records
the library defaults; the delivery adds an optional public path override.

Yes. We can keep Convex Auth while the browser uses `https://dune.zone` for our
sign-in and callback endpoints. I recommend a narrow proxy in the Cloudflare Worker
that already serves the site, with `CUSTOM_AUTH_SITE_URL=https://dune.zone`.
Google and Discord still show their own sign-in and consent pages. Convex continues
to run authentication behind the proxy.

Convex explicitly documents the URL override and separately documents proxying
HTTP actions to a default `*.convex.site` address without registering a Convex
custom domain. Combining those capabilities in our Worker is an engineering
inference supported by the library source. This research did not exercise a complete
proxied OAuth round trip. [Convex Auth URL override](https://labs.convex.dev/auth/advanced#custom-callback-and-sign-in-urls),
[Convex HTTP proxy guidance](https://docs.convex.dev/production/abuse-protection#putting-vercel-in-front).

## What we have today

- [`convex/auth.ts`](../../convex/auth.ts) configures Google and Discord. Its return
  URL callback allows destinations only on the configured `SITE_URL` origin.
- [`convex/auth.config.ts`](../../convex/auth.config.ts) accepts the token issuer
  in `CONVEX_SITE_URL`.
- [`convex/http.ts`](../../convex/http.ts) mounts the library's HTTP auth routes.
- [`workers/publisher/wrangler.jsonc`](../../workers/publisher/wrangler.jsonc) binds
  the existing Worker to `dune.zone`, but does not send `/api/auth/*` through
  `assets.run_worker_first`.
- [`workers/publisher/index.ts`](../../workers/publisher/index.ts) has no auth
  proxy handler before its application and asset handling.
- The login page calls `signIn(provider, { redirectTo: '/' })`. Provider connections
  use the same auth system from the profile edit page.

Read-only production checks confirmed that `CUSTOM_AUTH_SITE_URL` is absent on
`exuberant-finch-263`. A GET to `https://dune.zone/api/auth/signin/google`, with no
code or credentials, returned HTTP 200 and `text/html`. The backend's
[OpenID metadata](https://exuberant-finch-263.eu-west-1.convex.site/.well-known/openid-configuration)
advertises its existing Convex site URL as issuer and JWKS host. No sign-in was
initiated and no account was created during these checks.

## The settings do different jobs

Fresh source pins `@convex-dev/auth` 0.0.96. The installed checkout has 0.0.94,
so the relevant behavior was also checked against the published 0.0.96 package.
Its upstream source commit is `7eab86015b09cf91ac36a359beaaa4036aa24cc1`.
[Published package metadata](https://registry.npmjs.org/@convex-dev/auth/0.0.96).

| Setting | Job | Proposal |
| --- | --- | --- |
| `CUSTOM_AUTH_SITE_URL` | Browser sign-in and provider callback addresses | Set to `https://dune.zone`, with no trailing slash |
| `SITE_URL` | Destination after authentication | Keep `https://dune.zone` |
| `CONVEX_SITE_URL` | Token issuer and OpenID discovery/JWKS host, plus fallback auth address | Keep the existing Convex site URL |
| App Convex client URL | Backend calls and live subscriptions | Keep the existing Convex cloud URL |

The sign-in builder and callback builder both use `CUSTOM_AUTH_SITE_URL` when it
exists. JWT generation and OpenID metadata continue using `CONVEX_SITE_URL`.
The proposed switch therefore needs no token issuer change, key rotation, auth
table migration or replacement of Convex Auth. Existing sessions should remain
usable, which must still be verified with an existing session and token refresh.
[Sign-in builder](https://github.com/get-convex/convex-auth/blob/7eab86015b09cf91ac36a359beaaa4036aa24cc1/src/server/implementation/signIn.ts#L239-L241),
[callback builder](https://github.com/get-convex/convex-auth/blob/7eab86015b09cf91ac36a359beaaa4036aa24cc1/src/server/oauth/convexAuth.ts#L12-L14),
[token issuer](https://github.com/get-convex/convex-auth/blob/7eab86015b09cf91ac36a359beaaa4036aa24cc1/src/server/implementation/tokens.ts#L45),
[OpenID metadata](https://github.com/get-convex/convex-auth/blob/7eab86015b09cf91ac36a359beaaa4036aa24cc1/src/server/implementation/index.ts#L202-L206).

Changing `SITE_URL` alone would not change the auth endpoints. Changing the system
`CONVEX_SITE_URL` would also change the issuer and introduce an unnecessary token
transition. There is no need to proxy `/.well-known/*` for this proposal.
[Convex default domain settings](https://docs.convex.dev/production/custom-domains#changing-your-default-domain).

## Proposed implementation

Add selective Worker-first routing for `/api/auth` and `/api/auth/*`, then handle
only the intended sign-in and callback routes before the website's SSR and asset
fallback. Forward them to the fixed production HTTP-actions origin
`https://exuberant-finch-263.eu-west-1.convex.site`. Unknown auth paths should return
an auth-path error rather than the website HTML. The existing frontend receives
the new sign-in address from Convex Auth automatically.
[Worker-first routing](https://developers.cloudflare.com/workers/static-assets/routing/worker-script/#run-worker-first-for-selective-paths).

Preserve the method, path, query, callback body, relevant auth cookies, response
status, `Location`, and each individual `Set-Cookie` header. The library registers
GET sign-in and GET/POST callback routes. Set redirect mode to `manual` so the
browser receives the provider redirect and the cookies. Disable caching for auth
responses. Forward only the cookies and headers auth needs, rather than every
cookie on the apex domain. Use a fixed upstream and avoid logging codes or cookies;
review automatic request logging as well as application logs.
[Auth HTTP handlers](https://github.com/get-convex/convex-auth/blob/7eab86015b09cf91ac36a359beaaa4036aa24cc1/src/server/implementation/index.ts#L235-L378),
[Worker redirect handling](https://developers.cloudflare.com/workers/runtime-apis/request/#properties),
[multiple Set-Cookie headers](https://developers.cloudflare.com/workers/runtime-apis/headers/#getall-method).

The OAuth cookies have no `Domain` attribute. They use `Secure`, `HttpOnly`,
`SameSite=None`, `Path=/`, and `Partitioned`. Serving their responses through
`dune.zone` makes them cookies for that host. Preserve the attributes and test the
full provider round trip in Chrome, Firefox and Safari, including private browsing.
[Cookie options](https://github.com/get-convex/convex-auth/blob/7eab86015b09cf91ac36a359beaaa4036aa24cc1/src/server/cookies.ts#L3-L9).

## Provider configuration and rollout

1. Build and verify the proxy in an isolated environment. Use test OAuth clients
   and an HTTPS staging origin to verify the external provider round trip. Local
   password auth and mocked callbacks cannot prove provider acceptance or browser
   cookie behavior.
2. Register these production redirect addresses on the existing OAuth clients:
   `https://dune.zone/api/auth/callback/google` and
   `https://dune.zone/api/auth/callback/discord`. Keep the existing client IDs and
   secrets, and retain the old callbacks for rollback where supported.
3. Check Google's authorized domain and published branding. The new callback
   addresses the Convex hostname in the consent flow, but display name and logo
   also depend on Google's branding verification. Provider dashboards were not
   inspected during this research, so their current branding and callback lists
   remain unverified.
4. Deploy the Worker proxy while the current auth address remains active. Verify
   that the new paths reach Convex handlers rather than the website HTML.
5. Set production `CUSTOM_AUTH_SITE_URL=https://dune.zone`. Keep the existing
   issuer configuration, keys, accounts and backend client URL.
6. Verify both providers with existing accounts, a new account, cancellation,
   profile creation, provider connection, sign-out, and an existing session's
   refresh. Save evidence of the actual provider callback and final authenticated
   page, including Chrome, Firefox and Safari behavior.

Google requires an exact registered redirect URI, including scheme and trailing
slash. Discord also requires a registered redirect address.
[Google redirect requirements](https://developers.google.com/identity/protocols/oauth2/web-server#httprest),
[Discord authorization code flow](https://docs.discord.com/developers/topics/oauth2#authorization-code-grant),
[Google branding verification](https://developers.google.com/identity/protocols/oauth2/production-readiness/brand-verification).

Rollback removes `CUSTOM_AUTH_SITE_URL`, returning new sign-ins to the old address.
Keep both callback registrations and the proxy until the rollout is stable.
Attempts already midway through OAuth during either switch may need to restart:
token exchange computes its redirect URI from the current callback setting.
[Token exchange](https://github.com/get-convex/convex-auth/blob/7eab86015b09cf91ac36a359beaaa4036aa24cc1/src/server/oauth/callback.ts#L120-L134).

## Alternative and cost

A native Convex HTTP custom domain such as `auth.dune.zone` is the more directly
documented option. It requires Convex Pro and still uses a subdomain. Pointing the
apex at Convex would also require resolving ownership of the website's existing
Cloudflare domain; DNS cannot split traffic by URL path.
[Native custom domains](https://docs.convex.dev/production/custom-domains).

The recommended proxy uses our existing Worker and Convex's default HTTP origin.
It should require no Convex plan upgrade or new hosting service. It adds normal
Worker requests and subrequests, so this is not a promise of zero usage cost.
No billing capacity was measured for this task. The extra work is a small auth
proxy plus provider configuration and real browser verification, rather than an
auth-system migration.

The main release gate is a successful provider round trip through the proxy with
unchanged existing-session behavior. Research establishes feasibility; it does
not establish that the proposed integration already works in production.
