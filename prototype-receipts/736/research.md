# Convex in a Storybook web worker

## Finding

The idea is feasible. The real Dune Zone Convex schema, authenticated queries, trigger-aware mutations, and Aggregate components can run in an in-memory `convex-test` instance inside a browser Web Worker. The actual Create ruleset page now works in both Storybook development and a served static build. It creates a profile, submits the production mutation, observes the created ruleset through the production query, navigates to the result, replaces the worker, and creates the same ruleset again.

This can remove large response fixtures by running real selection and mutation code over a compact seeded world. It does not remove scenario design or seed data. It also does not provide a production Convex transport, supported browser runtime, or replacement for the small real-stack E2E confidence anchor.

## What was proved

The prototype used the versions currently installed in this repository: Convex 1.43.0, `convex-test` 0.0.55, Vite 8.2.0, Storybook 10.5.9, and `@convex-dev/aggregate` 0.2.2. It did not contact a hosted Convex deployment.

| Check | Development server | Served production build |
| --- | --- | --- |
| Create `convexTest(schema, modules)` in a dedicated worker | Passed | Passed |
| Run the real Rulesets route loader through the worker and render its private page component | Passed | Passed |
| Insert a third record, rerun the active `useRulesetsAll` query, and render the update | Passed | Passed |
| Execute the real `api.profiles.session` query | Passed | Passed |
| Register the three Aggregate mounts and execute `api.homepage.get` | Passed | Passed |
| Bootstrap an authenticated profile through the real mutation | Passed | Passed |
| Submit the actual Create ruleset page and observe its Aggregate-backed mutation result | Passed | Passed |
| Replace the worker, verify an empty database, and create the same ruleset again | Passed | Passed |
| Keep two adjacent identities separate and preserve a signed-out request | Passed | Passed |
| Reject an outbound `fetch` with the named worker guard | Passed | Passed |
| Invoke the local HTTP router and nested `ctx.runQuery` while global `fetch` remains blocked | Passed | Passed |
| Load function modules lazily with an ES-format worker | Passed | Passed |

The homepage query returned the expected empty-world result. The phase 2 production build emits a 79.08 kB initial worker chunk plus lazy Convex and Aggregate chunks. The whole Storybook build succeeded without a Convex deployment URL in its output. These are prototype measurements, not target budgets.

## Why it does not work without adaptation

`convex-test` is described and documented as a JavaScript mock for automated tests, not as a browser package. Its package has one ESM entry and no browser export condition. Its source imports Node's `AsyncLocalStorage` directly, creates four context stores, and uses them for test-instance, auth, transaction, and function-execution context. It also writes through the Node-style `global` name. [Convex testing documentation](https://docs.convex.dev/testing/convex-test), [`convex-test` 0.0.55 source](https://github.com/get-convex/convex-test/blob/925f5f848cf7a3a3d17a9fff798b3caca5de91c0/index.ts#L1-L3), [`convex-test` context stores](https://github.com/get-convex/convex-test/blob/925f5f848cf7a3a3d17a9fff798b3caca5de91c0/index.ts#L145-L147)

A normal Vite browser build externalizes `node:async_hooks`. The worker then fails at startup because `AsyncLocalStorage` is not a constructor. The successful proof needed:

1. A Vite alias from `node:async_hooks` to a small browser adapter.
2. `global` defined as `globalThis` for the worker bundle.
3. A worker-local mutable `process.env = {}` because this app's auth modules read and assign computed environment keys.
4. An explicit Vite module map instead of `convex-test`'s default project-relative glob.
5. A worker-only transform that changes `convex-test`'s hard-coded fake storage and HTTP-action origins from `some-deployment.convex.cloud` and `some.convex.site` to the reserved `storybook.invalid` domain. Without it, the publisher release guard rejects the static Storybook asset as a possible hosted Convex runtime reference.

The adapter in the proof retained a store until an asynchronous callback settled. That is enough for the serialized top-level queries exercised here, but it is not a complete `AsyncLocalStorage` implementation. `convex-test` deliberately serializes top-level functions while allowing nested `Promise.all` calls from actions, so overlapping and nested context propagation matters. Node documents `AsyncLocalStorage` as the stable, optimized context primitive. The browser replacement proposed by TC39 is still Stage 2, so there is no standards-based browser primitive to substitute today. [`convex-test` transaction manager](https://github.com/get-convex/convex-test/blob/925f5f848cf7a3a3d17a9fff798b3caca5de91c0/index.ts#L2250-L2285), [Node `AsyncLocalStorage`](https://nodejs.org/api/async_context.html#class-asynclocalstorage), [TC39 AsyncContext proposal](https://github.com/tc39/proposal-async-context)

The retained concurrency story confirms the failure. It overlaps two independent `convexTest` instances in one worker so the first settles while the second is awaiting. The shim restores the active store out of order, and the second transaction fails with `No active convexTest context`. One worker must therefore serialize all of its calls, and separate stories need separate workers.

There is another explicit upstream warning: Convex 1.43 logs when server functions are imported in a browser window and says a future version will throw. A worker avoids the current `window` check, but that is an accident of the check rather than support for this runtime. [Convex browser-import guard](https://github.com/get-convex/convex-js/blob/d28852aa028dede94796a012a2a802ae6ad04188/src/server/impl/registration_impl.ts#L132-L151)

## Module and component discovery

`convex-test` depends on Vite's `import.meta.glob`. It derives function paths from the glob keys, requires `_generated` to be present, and dynamically imports a function module on demand. The working root map was equivalent to:

```ts
import.meta.glob([
  '@convex/**/*.*s',
  '!@convex/**/*.d.ts',
  '!@convex/**/*.test.ts',
  '!@convex/convex.config.ts',
])
```

`*.*s` is necessary because the generated runtime contains `.js` modules. Excluding declarations is also necessary: Vite 8 otherwise tries to bundle type-only declaration imports as runtime code. Vite supports literal glob patterns, aliases, negative patterns, and lazy code-split imports. The literal nature of the patterns means the map must be authored at build time; Storybook cannot choose an arbitrary Convex source tree at runtime. [`convex-test` module cache](https://github.com/get-convex/convex-test/blob/925f5f848cf7a3a3d17a9fff798b3caca5de91c0/index.ts#L2102-L2138), [Vite glob imports](https://vite.dev/guide/features.html#glob-import)

Components are not discovered from `convex.config.ts`. Every mount needs `t.registerComponent(componentPath, schema, modules)`. Convex's component testing guide recommends a package-provided test helper, but the installed Aggregate helper uses the broad glob `./component/**/*.ts`. A static Vite build follows that map and reaches `arbitrary.helpers.ts`, which imports the package's uninstalled development dependency `@fast-check/vitest`. The proof instead registered `statistics`, `profileActivity`, and `profileDiscovery` with Aggregate's component schema and a narrow map that excluded two-dot support and test files. [`convex-test` component registration](https://github.com/get-convex/convex-test/blob/925f5f848cf7a3a3d17a9fff798b3caca5de91c0/index.ts#L2497-L2511), [Convex component testing](https://docs.convex.dev/components/authoring#testing), [Aggregate 0.2.2 test helper](https://github.com/get-convex/aggregate/blob/ef00fb8afe9e419f6013ae7d8e8c0478c2960752/src/test.ts#L1-L17)

This manual registration is workable, but it couples the Storybook build to package source layouts that are outside the packages' public client APIs. The Migrations component would need the same treatment. The Auth component has no test-helper export; signed-out queries and identity-based page states can use `withIdentity`, while full provider sign-in flows should stay outside this spike.

## Storybook bridge

The retained worker is request and response only. `convex-test` does not implement the Convex client's WebSocket subscription protocol, so feeding pages requires a Storybook-only bridge. The proof implements the following path:

- A decorator gives each active story its own worker and in-memory world.
- The actual `Route.options.loader` runs after the database doorway is temporarily pointed at worker RPC.
- The existing `convex/react` Storybook mock makes `useRulesetsAll` call the same worker. It returns `undefined` until the reply arrives, so the page uses its real loader fallback during that interval.
- A story-side insert increments a revision counter. Every active query reruns, and the private Rulesets page component renders the third result.
- Worker requests are serialized. Late replies are ignored after a hook unmounts, and terminating a story rejects its pending calls.

This proves the whole page path without exporting page composition from the route. It does use two fragile test seams: Storybook's module mock must be restored in the story `beforeEach`, and the story temporarily replaces TanStack Route's `useLoaderData` method so the private route component can consume the loader result without mounting the full application tree. A supported page-story harness would need to own these operations centrally rather than repeat them per route.

Injecting a fake client through `ConvexReactClient` is possible because 1.43.0 has a `baseClient` option, but the option and the required `BaseConvexClientInterface` are marked internal. Its source says it may become public later. Depending on it would make the prototype more fragile than adapting the Storybook mocks already owned by this repository. [Convex React internal client seam](https://github.com/get-convex/convex-js/blob/d28852aa028dede94796a012a2a802ae6ad04188/src/react/client.ts#L291-L306)

The bridge still needs explicit controls for a query that never resolves, an offline error, and other states that a real in-memory query cannot naturally hold. The worker now freezes `fetch` to a rejecting function before application modules load, and a story executes that guard. This catches accidental fetch calls but is not a security boundary. A hosted catalogue also needs a worker response policy with `connect-src 'none'`.

## Development, static paths, and CSP

Use Vite's recommended constructor form with static arguments:

```ts
new Worker(new URL('./convex.worker.ts', import.meta.url), { type: 'module' })
```

Vite recognizes that exact shape, emits the worker as an asset, and rewrites its URL for the configured base path. ES worker output retains lazy chunks and avoids loading every Convex function up front. Storybook's `viteFinal` configuration applies to both development and production, and the static builder invokes the builder's production build, so the alias, worker format, and module-map support belong in the shared Storybook Vite configuration. [Vite Web Workers](https://vite.dev/guide/features.html#web-workers), [Vite public base path](https://vite.dev/guide/build.html#public-base-path), [Storybook Vite configuration](https://storybook.js.org/docs/builders/vite), [Storybook builder API](https://storybook.js.org/docs/builders/builder-api)

Do not inline the worker. A separately emitted same-origin worker is compatible with a policy such as `worker-src 'self'`; an inline Blob worker also needs `blob:`. The worker constructor is governed by the same-origin policy, and CSP `worker-src` governs worker script requests. [HTML Worker specification](https://html.spec.whatwg.org/multipage/workers.html#dom-worker-dev), [CSP `worker-src`](https://www.w3.org/TR/CSP3/#directive-worker-src)

The standalone production proof verifies Vite's worker and chunk behavior against the actual `storybook build` output under an HTTP server. The same authenticated create, reset, and recreate interaction passed in the development server and served static output. The unchanged output also passed when served below `/catalogue/`: the iframe, worker, lazy Convex chunks, mutation, navigation, and result all resolved from the prefix. This proves the preview graph used by the page story. The Storybook manager has a separate asset graph and still needs a host-level smoke check when the catalogue deployment is chosen.

The browser-mode Storybook test runner has another build-specific obligation. It must pre-bundle the Convex server dependencies before the suite starts. Without that list, Vite discovers the worker closure after the first story has run, re-optimizes its dependency cache, and reloads the browser suite. The worker-backed Rulesets tests passed in that failed CI run, but the reload broke two unrelated sheet stories with a stale dynamic-import URL. This is another version-sensitive list to maintain alongside the worker module maps.

## Determinism and repository cost

The database replaces response fixtures, not scenario design. One compact seed should build a canonical world through database inserts or real mutations, with small overrides per story. That concentrates data and runs the same selection code as production.

The retained proof makes the tradeoff visible. The authenticated page uses a 25-line seed module containing two users and no response-shaped fixture. The shared worker, protocol, browser shim, and Storybook bridge are 475 lines. The create story is another 290 lines, although much of that is proof UI and stress coverage that a reusable page harness would absorb. The cost moved from repeated response fixtures into one substantial compatibility layer and smaller scenario seeds.

Determinism needs deliberate handling:

- Pin domain timestamps and any ordering inputs.
- Account for `_creationTime`, which is clock-derived in `convex-test`.
- Reset by replacing the worker. `convex-test` exposes no public snapshot or reset API.
- Keep IDs inside the seeded world instead of asserting generated values.
- Prevent network actions and keep `process.env` empty. Never bake deployment secrets into a static Storybook bundle.

This also publishes the Convex function source, schema, validators, and embedded constants as downloadable Storybook assets. That source is normally server-only. A static Storybook deployment must be treated as a public disclosure boundary even if the UI is access controlled.

## Risks and recommendation

The main risks are:

1. **Incorrect async context.** The small adapter can mix auth or component state under nested or overlapping asynchronous work.
2. **Upstream drift.** `convex-test`, Convex's browser-import guard, Vite glob output, and component package source layouts are not browser contracts.
3. **Incomplete fidelity.** There is no real subscription engine, scheduler service, auth provider flow, deployment environment, or backend isolation model.
4. **Build and startup weight.** Even lazy output adds hundreds of kilobytes and many static chunks.
5. **Source disclosure and accidental network access.** Server code becomes browser code, and actions run with the viewer's browser capabilities.
6. **Seed complexity.** A believable reusable world is smaller than page response fixtures, but it is still maintained data and can become a second database population system.
7. **Static-output rewriting.** The release depends on a transform tied to a private string inside `convex-test`; upstream storage-emulation changes can bypass or break it.
8. **Optimizer coupling.** The browser test configuration must name the worker's server dependencies before Vite starts the suite, or dependency discovery can reload unrelated stories.

## Weighted decision

The product and test value is now stronger than the first phase suggested. A page story can render a real private page, use production reads and mutations, show the result immediately, reset in about the time of a normal interaction test, and remain available to a developer in a local browser. The complete Storybook browser suite still passed 381 tests in 25.06 seconds. The new page-specific fixture is 25 lines rather than a copied query result. These benefits repeat across every page story once the bridge is shared.

The costs are concentrated but serious. The runtime depends on an incomplete async-context shim, package source layouts, build transforms, optimizer hints, and manual component registration. Static publishing exposes server source. Storybook still lacks production auth, WebSocket transport, deployment environment, and backend scheduling fidelity. The JavaScript network guard is deterministic protection, not a security boundary.

My weighted recommendation is to continue toward a controlled experimental harness, not a repo-wide default yet. The authenticated create/reset proof clears the largest feasibility question, and the fixture reduction plus interactive page development justify more work. Before rollout, prove nested action and scheduled-function context, rollback, component auth boundaries, and CSP on the worker response. Pin the dependency versions and keep all worker RPC serialized. If those checks pass, use the harness for page state and interaction coverage while retaining a few real-stack E2E paths.

If those tests expose context bugs, the responsible next experiment is a small pinned fork of `convex-test` that passes execution context explicitly or provides a browser adapter. The official self-hosted Convex backend is not a static-build alternative: it is a native or Docker backend with SQLite and an HTTP service, so it cannot travel inside a static Storybook artifact. [Convex self-hosting](https://github.com/get-convex/convex-backend/blob/main/self-hosted/README.md)
