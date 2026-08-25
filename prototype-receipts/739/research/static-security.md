# Static security boundary for browser-hosted Convex source

## Decision

The current #736 artifact must not be published. Its broad module glob makes operational Convex source downloadable, including authentication, E2E, migration, provisioning, publication administration, and account-deletion modules. Minification and the absence of source maps do not change that disclosure.

A narrower worker-backed Storybook can be published on a public static host, but only when every included source file and dependency is approved for public disclosure and every mandatory gate in this report passes. A build that contains source approved only for employees or collaborators must use edge-enforced access control on every HTML, JavaScript, and asset response. Secrets, real user data, and hosted Convex credentials are forbidden in either form.

The security boundary is the final static artifact plus its HTTP response policies. The source tree, a JavaScript replacement for `fetch`, CORS, minification, and a private-looking Storybook URL are not security boundaries.

## Evidence reviewed

This review used the #736 branch at commit [`709f5f59`](https://github.com/ndelangen/dunezone/commit/709f5f59cfa79a2c0065793872e6deb7ac1369bc), its retained static Storybook build, and the [spike report](https://github.com/ndelangen/dunezone/blob/709f5f59cfa79a2c0065793872e6deb7ac1369bc/prototype-receipts/736/research.md). The build was inspected as files, not inferred from TypeScript source.

| Static evidence | Result |
| --- | ---: |
| Files in the build | 434 |
| Total build size | 10,867,485 bytes |
| Initial worker | 79,680 bytes |
| Convex module paths in the worker map | 57 |
| Source maps | 0 |
| `.convex.cloud` or `.convex.site` strings | 0 |

The worker map covers all `convex/**/*.{ts,js}` files except a few filename exclusions. Vite turns an [`import.meta.glob`](https://vite.dev/guide/features#glob-import) into a module map and lazy imports into emitted chunks. The retained output therefore contains code that no story calls. Recoverable output includes function paths such as `statistics:rebuild`, table and index names, authorization helpers such as `requireAssignableGroup`, HTTP publication routes, environment key names, limits, error text, and provider endpoints.

No locally available environment value of sufficient length matched the retained output. The scan printed names only, not values. This proves only that those available values were absent from this artifact. It does not prove that another developer machine or CI build cannot embed a value. The build also contains no hosted Convex URL or source map, which are useful checks but do not make the published source private.

The spike sets `process.env` to an empty object and freezes `fetch` to a rejecting function before loading application modules. It also rewrites two fake `convex-test` storage origins to `storybook.invalid`. Those measures explain the clean endpoint scan. They do not contain all browser network APIs or a compromised dependency.

## Exposure classification

| Class | What the artifact exposes | Treatment |
| --- | --- | --- |
| Server and dependency source | Schema, validators, function paths, authorization branches, HTTP routes, migration names, provider setup, dependency implementation, error paths | Public only after an owner approves the complete transitive closure. Otherwise restrict the whole site or keep it local. |
| Constants and metadata | Table and index names, status values, limits, asset rules, route names, provider URLs, error copy | Treat as source. A hard-coded value is public once bundled. |
| Environment variable names | Names such as `AUTH_GOOGLE_SECRET`, `CONVEX_SITE_URL`, and publisher secret keys remain visible even when their values are absent | Remove modules that need secret-bearing environment variables from the browser closure. Fail an unexpected environment-key scan. |
| Environment values | Vite and Storybook replace selected values during the build. Storybook warns that its environment values are embedded and viewable | No secret may be present in the build process. Allow only explicit inert values, then scan the final bytes. |
| Deployment endpoints and credentials | None were observed in the retained build | Hosted Convex URLs, tokens, cookies, private keys, and publisher credentials are release blockers. An inert reserved origin is acceptable. |
| Data | Story seeds and returned rows are downloadable or observable in the viewer's browser | Use synthetic deterministic data only. Production exports, personal data, real account identifiers, and copied auth material are forbidden. |
| Runtime capabilities | A dedicated worker has no DOM, but it can use `fetch`, `XMLHttpRequest`, WebSocket, IndexedDB, subworkers, cryptography, and `postMessage` where the browser supports them | Enforce network denial with response CSP, narrow the message protocol, avoid browser credentials and persistent storage, and keep JavaScript guards as defense in depth. |
| Callable surface | The spike accepts arbitrary query and mutation names and arbitrary seed/reset requests. A viewer can instantiate the public worker URL and send the same protocol | Replace string-selected access with an explicit function and operation allowlist. Validate every message at runtime. Exclude spike probes and administrative operations. |

[Storybook documents](https://storybook.js.org/docs/configure/environment-variables) that `STORYBOOK_` and `VITE_` values can enter a Vite-backed preview and are hard-coded in a static build. Vite likewise documents that `VITE_*` values are client-visible, `define` performs static replacement, `.env` files are loaded by default, and Bun may load them into `process.env` before Vite starts. [`envDir: false`](https://vite.dev/config/shared-options#envdir) disables Vite's own `.env` loading, but it cannot remove values Bun or CI already placed in the process. The builder must therefore start with a scrubbed process environment as well as a disabled environment directory.

The concern is not theoretical. Storybook disclosed [CVE-2025-68429](https://storybook.js.org/blog/security-advisory/), where certain `.env` and `process.env` patterns copied values into published bundles. The spike uses patched Storybook 10.5.9, above the 10.1.10 fix floor. The lesson remains part of the release contract: pin a patched version and never give a client build secrets it is expected to preserve.

## Network boundary

[Web workers have a separate global context](https://developer.mozilla.org/en-US/docs/Web/API/Web_Workers_API/Using_web_workers), but they can make network requests and send messages to their owner. A worker is generally not governed by the document's CSP. The worker script response must carry its own `Content-Security-Policy` header.

The worker response must enforce at least:

```http
Content-Security-Policy: default-src 'none'; script-src 'self'; connect-src 'none'; worker-src 'none'
```

`script-src 'self'` permits the same-origin lazy chunks emitted by Vite. `connect-src 'none'` blocks script connections including fetch, XHR, WebSocket, EventSource, and WebTransport under [CSP Level 3](https://www.w3.org/TR/CSP3/#directive-connect-src). `worker-src 'none'` prevents subworkers. This must be an enforcing header on the worker JavaScript response, not a report-only policy or a meta tag.

The static manager and preview iframe must also enforce `connect-src 'none'`, `worker-src 'self'`, and restrictive `img-src`, `media-src`, `form-action`, and `object-src` directives. This prevents worker results from being relayed through ordinary page network primitives. The exact document policy may need local script and style allowances for Storybook, but every allowance must be derived from the final build and tested. A Storybook addon that requires a remote connection is incompatible with this public build unless that connection receives a separate review.

Development has a narrower exception. The local Storybook server may allow only its loopback HMR connection. No external API, hosted Convex origin, developer cookie, or credential may be available to the worker. The worker's frozen `fetch` function remains useful because it gives developers a named failure, but CSP and browser network tests decide release safety.

[Convex actions support `fetch`](https://docs.convex.dev/functions/actions), so bundling an action can create an outbound path even when its normal server environment is absent. `convex-test` is a [JavaScript mock with documented limitations](https://docs.convex.dev/testing/convex-test), not a sandbox. It must not be treated as one.

## Mandatory release contract

### Prevention at build time

1. Replace the broad source glob with a checked-in exact module manifest. The manifest must cover root functions, transitive `convex/**` support files, component source files, and package versions. A build plugin must fail when the final worker module graph contains an unlisted source module.
2. Exclude authentication providers, HTTP publication handlers, E2E support, migrations, provisioning, administrative functions, account deletion, deployment checks, and every action not required by an approved story. An exception needs a named source owner and public-disclosure approval.
3. Build in a secret-free process. Disable Vite `.env` loading, start Bun or Node with a scrubbed environment, use a nonempty narrow `envPrefix`, and define only reviewed inert constants. Do not spread or dynamically index `process.env` or `import.meta.env`.
4. Keep `process.env` frozen and empty inside the worker. Inject a typed story configuration object only if a story needs a nonsecret value.
5. Emit no source maps. Keep the worker and its chunks as same-origin files, not Blob or data URLs.
6. Pin Storybook, Vite, Convex, `convex-test`, Aggregate, and every browser shim in the lockfile. A dependency or private package-source layout change requires review of the worker module graph and artifact diff.
7. Use synthetic seeds. Seed data must be reviewed as publishable content and must not come from a hosted database export.

### Prevention at runtime and hosting

1. Validate worker messages against a closed discriminated protocol. Map approved operation identifiers to approved function references. Do not accept arbitrary function names, table names, HTTP paths, scheduler probes, or source-module paths.
2. Give each story a fresh dedicated worker and terminate it on story cleanup. Do not share identity, data, or persistent browser storage between stories.
3. Apply the worker CSP above to the worker JavaScript response and a tested restrictive CSP to both Storybook documents. Keep the JavaScript network guard and freeze or remove unused connection constructors as defense in depth.
4. Serve over HTTPS from a host that can set response headers on hashed worker assets. A host that cannot attach the worker CSP fails the release gate.
5. For restricted source, enforce identity at the edge before every HTML, JavaScript, JSON, and asset response. Disable public caches and alternate public origins. Client-side passwords and unlisted URLs do not count. Authorized viewers can still download every served file, so restricted hosting never permits secrets.

### Detection in CI

1. Produce a machine-readable manifest of every worker module and emitted worker chunk. Diff it in review and fail on an unapproved addition.
2. Scan final static bytes for source maps, hosted Convex origins, production domains, known secret formats, forbidden environment key names, forbidden module and function names, and high-entropy credential candidates.
3. In a separate post-build job, compare final bytes with the exact values of relevant CI secrets without printing those values or allowing the static builder to access them.
4. Serve the exact artifact and use Playwright to observe and abort all HTTP, WebSocket, and worker requests. [Playwright routing](https://playwright.dev/docs/network#handle-requests) is a detection tool, not the deployed boundary. Disable service workers during this test so they cannot hide requests.
5. Read the worker response headers in a real browser, then prove that fetch, XHR, WebSocket, and subworker probes fail. Prove that same-origin lazy chunks still load. Run the same story interaction from a nonroot base path.
6. Scan the dependency lock and advisories. Record the tool versions and artifact digest with the release.

## Hosting choices

| Hosting choice | Acceptable when | Limits |
| --- | --- | --- |
| Public static | The complete source and data closure is approved public, all prevention gates pass, and the served artifact passes header and network checks | Anyone can retain and inspect the files. Removal later does not undo disclosure. |
| Access-controlled static | The closure is approved for the authenticated audience, all public-build gates still pass, and edge auth covers every asset path | It reduces the audience. It does not hide source from authorized users or make embedded secrets safe. |
| Local or CI only | Source approval is absent, the host cannot set worker headers, or an addon requires outbound access that cannot be removed | This is the required fallback, not a partial release. |

Storybook produces a [static web application that any web server can serve](https://storybook.js.org/docs/sharing/publish-storybook). That portability means host capabilities vary. Hosting selection must be based on verified header, authentication, and cache behavior, not on the Storybook provider's name.

## Stop conditions

Stop publication when any of the following occurs:

- The module or chunk manifest changes without review, or a broad glob returns.
- An auth, E2E, migration, provisioning, administrative, deletion, HTTP secret, or unapproved action module enters the closure.
- A secret value, private key marker, real user record, hosted Convex endpoint, production domain, unexpected environment key, or source map appears in the artifact.
- The builder can read repository `.env` files or a secret-bearing ambient environment.
- The worker accepts an arbitrary function, table, module, or URL from a message.
- The worker response lacks its enforcing CSP, is served with report-only CSP, or any outbound network or subworker probe succeeds.
- The document can relay worker data through a permitted external connection or resource destination.
- A public asset path bypasses edge authentication or restricted content receives public cache headers.
- A dependency version, browser shim, package source layout, Storybook builder, or hosting behavior changes without rerunning the artifact and browser checks.
- The source owner will not affirm that the complete served closure is appropriate for its intended audience.

## Accepted boundary

The current #736 build is rejected for publication. The browser-worker plan remains feasible only with an exact approved source closure, a hermetic secret-free build, a closed worker protocol, worker and document CSP enforced by the host, final-bundle scans, and browser network probes. Public static hosting is acceptable after those gates pass and every included file is approved public. Otherwise the same artifact must be access controlled or kept local, according to its source classification.
