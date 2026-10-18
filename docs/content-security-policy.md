# Application content security policy

The publisher serves application documents in two ways. Static Assets serves the browser shell for
login, editors and Play. `handleApplicationRequest` serves public TanStack HTML from a release-scoped
edge cache. Both use `applicationContentSecurityPolicy` in `workers/publisher/application-security.ts`.
Published Rulebook HTML and standalone SVG illustrations retain their separate, script-free policies.
Storybook has its own deployment and policy.

## Resource inventory

| Resource | Source and reason |
| --- | --- |
| JavaScript | Same-origin content-hashed bundles plus the Cloudflare Web Analytics beacon from `https://static.cloudflareinsights.com`. The beacon was observed in the live browser, injected at the edge rather than by application code. |
| Analytics connection | `https://cloudflareinsights.com`, as required by Cloudflare Web Analytics. |
| Inline startup | TanStack hydration and stream cleanup, plus the layout's color-scheme and motion scripts. JSON-LD is emitted as script content too. |
| Convex HTTP and WebSocket | The exact deployment origin from `VITE_CONVEX_URL` for the static build and `CONVEX_CLOUD_BASE_URL` for SSR, including the regional hostname. Production uses `https://exuberant-finch-263.eu-west-1.convex.cloud` and its `wss:` counterpart. |
| Play and homepage sockets | Same-origin `/__play/` routes. The policy also names the document's WebSocket origin explicitly because browser support for WebSockets under `'self'` varies. The static shell names `wss://dune.zone`. |
| Artwork, published sheets, imported images | Same-origin `/m/`, `/image/`, `/web/`, `/published/` and `/user-images/`. Editors also use `data:` and `blob:` images for previews and textures. |
| Profile avatars | Any HTTPS origin, as allowed by the existing profile URL validator. This includes provider avatars and user-selected URLs, so an image-host allowlist would change the product contract. |
| Fonts | Bundled Fontsource CSS, local `/font/` files and bundled font assets. `data:` fonts remain permitted. |
| Video | Same-origin header video, plus `blob:` media. Blog YouTube players load only after a click, inside `https://www.youtube-nocookie.com` frames. Their own subresources are governed by the frame's policy. |
| Frames | Same-origin faction sheet previews use `srcdoc`; YouTube uses the origin above. |
| Styles | Local stylesheets and inline Mantine variables, React style attributes, print styles and WebGL overlays. Inline styles remain permitted. |
| Workers | Same-origin only. The Convex Storybook worker is confined to Storybook, outside this deployment. |
| Authentication | Convex actions use the deployment above. `/auth/signin/` and `/auth/callback/` proxy OAuth server-side. Provider redirects are top-level navigation, not browser script or connection sources. |
| Publisher capture | `/publisher-capture.html` and its bundles are served from the publisher's workers.dev origin, with same-origin snapshot reads. Static Assets applies the same policy. |

External anchor destinations, including Discord, GitHub and BoardGameGeek, do not need script or
connection permission. OAuth providers likewise need no script permission. No JavaScript `eval`,
WebAssembly compilation or production browser worker was found in the app's
execution paths, so those are not granted extra permission.

## Inline scripts and caching

Assembly normalizes the SPA shell's volatile hydration timestamp, then hashes its inline script text after HTML parsing normalizes line endings and NULL characters. `_headers` is a template populated with those hashes and the configured Convex origin. A missing
backend URL fails assembly. The completed header must fit Cloudflare's 2,000-character line limit.

A public SSR cache miss generates a random render nonce. An anonymous request carries it to the
server's router, which supplies it to TanStack's script machinery. The cache stores that HTML and the
render nonce in a private response header. On every delivery, including a cache hit, HTMLRewriter
replaces only matching script/style nonce attributes and the router's nonce metadata with a fresh
random nonce, then removes the private header. It never grants a nonce to an unmarked script or a
script carrying another value. The body stays streamed, and the edge cache keeps its existing TTL.

Scripts cannot use inline event handlers or `eval`. Forms submit only to this origin. `object-src`,
`base-uri` and frame-ancestor protections remain in force. This reduces script injection paths; it
does not make arbitrary JavaScript execution safe. In particular, HTTPS avatar images remain an
external request channel if an attacker already controls script execution.

## Verification

`scripts/application-security.browser.test.ts` exercises native HTMLRewriter, the real edge cache and
Chromium. It checks trusted nonce and hash startup, fresh nonces on cache hits, same-origin scripts,
the configured backend, and blocked injected scripts, event handlers, `eval` and foreign connections.
`publisher:application-runtime:verify` checks nonces on executable scripts in assembled public responses and
compares cached HTML after normalizing only its delivery nonce. Publisher assembly tests cover the
static hash and connection policy.

Cloudflare's [Static Assets headers documentation](https://developers.cloudflare.com/workers/static-assets/headers/)
explains why Worker responses need their own headers. Cloudflare lists the [Web Analytics CSP sources](https://developers.cloudflare.com/fundamentals/reference/policies-compliances/content-security-policies/). The browser semantics are described in the
[script-src reference](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Content-Security-Policy/script-src).
