# Convex worker phase 2 research

## Result

The phase 2 design can support separate signed-in story users, real component-backed mutations, and a clean database per story. The browser `AsyncLocalStorage` adapter remains the weak point. Upstream's identity and component guarantees assume a real async context implementation, so the Storybook worker must prove those cases again rather than inherit confidence from `convex-test`'s Node test suite.

Terminating a dedicated worker is the right reset. Replacing the worker's `fetch` function before any Convex function module loads is a useful deterministic guard, but it is not a security boundary. A worker response policy with `connect-src 'none'` is the browser-enforced option.

Storybook browser tests can cover this worker bridge and page behavior in a real browser. They do not replace the few real-stack E2E tests required by this repository's confidence stack.

## Identity behavior and separation

`withIdentity` does not create another database. It returns another set of query, mutation, action, and `run` methods bound to an `AuthFake`, while every bound accessor still closes over the same `convexGlobal` and its databases. That is the useful shape for stories: Alice and Bob can act on one seeded world, and the plain test accessor remains signed out. [`convex-test` identity binding](https://github.com/get-convex/convex-test/blob/925f5f848cf7a3a3d17a9fff798b3caca5de91c0/index.ts#L2473-L2511)

The caller may provide any subset of `UserIdentity`. `convex-test` fills missing values as follows:

- `issuer` becomes `https://convex.test`.
- `subject` becomes a signed 32-bit hash of `JSON.stringify(identity)`.
- `tokenIdentifier` becomes `${issuer}|${subject}`.

The generated subject is convenient, not a uniqueness guarantee. Its hash is only 32 bits and JSON property order affects the input. Story seeds should always pass explicit, stable subjects. Calling `withIdentity({})` creates an authenticated identity; it does not mean signed out. Use the unbound `t` accessor for that state. [`withIdentity` implementation](https://github.com/get-convex/convex-test/blob/925f5f848cf7a3a3d17a9fff798b3caca5de91c0/index.ts#L2487-L2500), [`simpleHash` implementation](https://github.com/get-convex/convex-test/blob/925f5f848cf7a3a3d17a9fff798b3caca5de91c0/index.ts#L3294-L3302)

With upstream's real `AsyncLocalStorage`, identity propagates through a top-level query, mutation, or action and through nested calls in the same component. It intentionally stops at a component boundary. A function called directly on a component may receive the chosen identity, but an app function that calls into a component gets an empty identity inside that component. Scheduled functions also run signed out. Upstream tests cover all of these cases. [`convex-test` authentication tests](https://github.com/get-convex/convex-test/blob/925f5f848cf7a3a3d17a9fff798b3caca5de91c0/convex/authentication.test.ts#L18-L107), [`convex-test` component auth tests](https://github.com/get-convex/convex-test/blob/925f5f848cf7a3a3d17a9fff798b3caca5de91c0/convex/components.test.ts#L126-L161), [`authForComponent`](https://github.com/get-convex/convex-test/blob/925f5f848cf7a3a3d17a9fff798b3caca5de91c0/index.ts#L2538-L2545), [scheduled auth reset](https://github.com/get-convex/convex-test/blob/925f5f848cf7a3a3d17a9fff798b3caca5de91c0/index.ts#L1682-L1700)

The phase 1 browser adapter does not yet earn those guarantees. Its store remains set until a returned promise settles. Two overlapping RPC calls with different identities can therefore restore stores in the wrong order. Serializing all worker RPC is the safe baseline. The phase 2 browser suite should still run overlapping Alice and Bob requests and reject the adapter if either sees the other's subject. Nested actions, component calls, and scheduled functions need separate checks.

The parent-side query cache must include identity in its key. A key made only from function name and arguments can show Alice's result to Bob even if the worker isolates the executions correctly.

## Component-backed mutations

`convex-test` supports direct component mutations and app mutations that cross component boundaries. Upstream registers a component with its schema and module map, then tests direct mutations, parallel mutations on two mounts, nested component queries, scheduled component mutations, and separate test instances. [`convex-test` component tests](https://github.com/get-convex/convex-test/blob/925f5f848cf7a3a3d17a9fff798b3caca5de91c0/convex/components.test.ts#L9-L123), [separate-instance test](https://github.com/get-convex/convex-test/blob/925f5f848cf7a3a3d17a9fff798b3caca5de91c0/convex/components.test.ts#L190-L233)

Aggregate writes are ordinary cross-component mutations. The Aggregate client calls `ctx.runMutation` on functions such as `public.insert`, `public.replace`, and `public.clear`. The test runtime must register each mount with the exact name used in `convex.config.ts`. For Dune Zone those names are `statistics`, `profileDiscovery`, and `profileActivity`. [Aggregate client writes](https://github.com/get-convex/aggregate/blob/ef00fb8afe9e419f6013ae7d8e8c0478c2960752/src/client/index.ts#L372-L455), [Aggregate clear](https://github.com/get-convex/aggregate/blob/ef00fb8afe9e419f6013ae7d8e8c0478c2960752/src/client/index.ts#L476-L485), [Dune Zone component mounts](../../convex/convex.config.ts)

Seeding method matters. This app's exported mutation builders wrap writes with application triggers. A raw `t.run(ctx => ctx.db.insert(...))` bypasses that wrapper and leaves Aggregate state stale. Seed through public mutations where practical. If a seed needs direct inserts, wrap the context with `applicationTriggers.wrapDB`, as the existing statistics and homepage suites do. [Trigger-aware mutation builders](../../convex/functions.ts), [homepage seam test](../../convex/homepage.test.ts)

The existing homepage suite is strong evidence for this exact path. It registers all three Aggregate mounts, selects a user with `withIdentity`, creates a faction, ruleset, question, and answer through public mutations, checks component-backed homepage totals, then deletes records through public mutations and checks the totals again. `bun run test convex/homepage.test.ts` passed both tests during this research pass.

The browser build still cannot use the installed Aggregate test helper unchanged because its broad glob imports test-only source. It should keep the narrow component map from phase 1. Aggregate insert and replace complete within the calling mutation. Operations such as `clear` schedule cleanup work, so a story that uses them must drain scheduled functions or replace the worker before asserting final cleanup. `convex-test` exposes explicit methods to finish scheduled work. [`convex-test` scheduler API](https://github.com/get-convex/convex-test/blob/925f5f848cf7a3a3d17a9fff798b3caca5de91c0/index.ts#L2012-L2035), [Aggregate component clear](https://github.com/get-convex/aggregate/blob/ef00fb8afe9e419f6013ae7d8e8c0478c2960752/src/component/public.ts#L140-L174)

## Reset and worker lifecycle

`convex-test` has no disposal or database-reset method. Each `convexTest()` call creates a new root `DatabaseFake`, component map, transaction manager, and scheduler. Multiple instances can coexist because the real package selects the active instance through async context. Creating a second instance does not cancel timers captured by the first one. [`convexTest` instance construction](https://github.com/get-convex/convex-test/blob/925f5f848cf7a3a3d17a9fff798b3caca5de91c0/index.ts#L2440-L2471), [`convex-test` scheduler state](https://github.com/get-convex/convex-test/blob/925f5f848cf7a3a3d17a9fff798b3caca5de91c0/index.ts#L2210-L2248)

Terminate the old dedicated worker and create a new one for each story epoch. The HTML worker algorithm sets the worker's closing flag, discards queued tasks, aborts the running script, and empties the dedicated worker's message queue. A new worker gets a new global environment and reevaluates the module graph, so the old in-memory databases, async stores, timers, and module state cannot enter the new story. [HTML worker termination algorithm](https://html.spec.whatwg.org/multipage/workers.html#terminate-a-worker), [`Worker.terminate()`](https://html.spec.whatwg.org/multipage/workers.html#dom-worker-terminate)

Termination is sufficient for `convex-test` state. It cannot undo an external side effect already sent by an action, data written to browser storage, or stale values kept by the parent Storybook frame. The bridge cleanup must also reject outstanding RPC promises, remove listeners, clear its query-result cache, and increment an epoch so late messages cannot publish into the next story.

A worker per story is preferable to an in-worker reset command. It is slower, but it removes hidden state without depending on private `convex-test` fields. If Docs mode mounts several stories at once, each mounted story needs its own worker or an explicit instance identifier and strict RPC serialization.

## Denying outbound network access

Install a deny function before any app function module can load, and freeze the binding:

```ts
const denyFetch = async (input: RequestInfo | URL): Promise<never> => {
  throw new TypeError(`Outbound fetch is disabled in Storybook Convex: ${String(input)}`);
};

Object.defineProperty(globalThis, 'fetch', {
  configurable: false,
  writable: false,
  value: denyFetch,
});
```

Make this the first side-effect dependency of the worker entry. Convex function modules load lazily through `import.meta.glob`, so they cannot capture the native function first. Do not replace `Request`, `Response`, `URL`, `Blob`, `crypto`, or `MessageChannel`; `convex-test` uses them. Its `t.fetch()` helper does not call the global network function. It constructs a local `Request`, resolves the app's HTTP router, and invokes the handler in memory. [`convex-test` HTTP helper](https://github.com/get-convex/convex-test/blob/925f5f848cf7a3a3d17a9fff798b3caca5de91c0/index.ts#L3003-L3040)

This guard prevents accidental calls through `globalThis.fetch`. It does not stop WebSocket, EventSource, XMLHttpRequest, Beacon, or a module that obtained a native reference before the guard. The browser-enforced option is `Content-Security-Policy: connect-src 'none'` on the emitted worker response. CSP defines `connect-src` to cover fetch, XHR, EventSource, Beacon, and WebSocket. The worker processing model initializes a policy container from the worker response, so setting a policy only on the Storybook HTML response is not enough to claim worker enforcement. [CSP `connect-src`](https://www.w3.org/TR/CSP3/#directive-connect-src), [worker policy initialization](https://html.spec.whatwg.org/multipage/workers.html#worker-processing-model)

Use both when hosting permits response headers. The JavaScript guard gives a clear story error. CSP blocks other connection APIs. Keep `worker-src 'self'` and a script policy that permits the worker's same-origin lazy chunks. Playwright request and WebSocket routing can audit tests, but it protects only the test run, not someone browsing the published Storybook. [Playwright network interception](https://playwright.dev/docs/network#handle-requests), [CSP `worker-src`](https://www.w3.org/TR/CSP3/#directive-worker-src)

## Storybook browser tests versus E2E

This repository's `storybook:test` command uses the Storybook Vitest plugin with Vitest browser mode and Playwright's Chromium provider. The addon transforms stories into component tests and runs their render and play behavior in a real browser. This is the right place to prove worker construction, static identity selection, query loading, mutation RPC, query reruns, DOM behavior, worker cleanup, and two-story isolation. [Storybook Vitest addon](https://storybook.js.org/docs/writing-tests/integrations/vitest-addon), [Storybook interaction tests](https://storybook.js.org/docs/writing-tests/interaction-testing), [local Storybook test configuration](../../vitest.storybook.config.ts)

Those tests run composed stories under the Vitest Vite server. They do not execute the files emitted by `storybook build`. Keep a separate Playwright smoke test that serves `storybook-static` and opens a page story, preferably below a non-root path. That catches worker asset URLs, lazy chunk paths, host headers, and production-only CSP.

Neither Storybook test reaches a real Convex deployment. It cannot prove the WebSocket subscription protocol, production auth, deployment environment variables, scheduled backend execution, server isolation, deploy ordering, or the application's production bundle and routing. It also cannot prove that the in-memory behavior matches a backend syscall that `convex-test` does not implement.

The repository decision remains sound: types first, Convex seam suites for behavior types cannot express, and a few happy-path E2E tests against the real stack. A page story with this worker is a rich component and seam test. It can replace page response fixtures and duplicated mid-stack UI tests. It cannot replace the E2E confidence anchor for a major user flow. [ADR-0002](../../docs/adr/0002-confidence-stack.md), [Playwright end-to-end test guidance](https://playwright.dev/docs/writing-tests)

## Phase 2 acceptance checks

Before sharing the runtime across page stories, require these browser checks:

1. Alice and Bob issue overlapping authenticated queries and each sees only the requested subject.
2. A signed-out request between signed-in requests remains signed out.
3. An app mutation updates an Aggregate mount and the active page query rerenders.
4. A component call does not inherit app auth, while a direct component call does.
5. A scheduled function runs signed out and cannot publish into a later story epoch.
6. Terminating and recreating the worker returns the database to its empty state and rejects old RPC promises.
7. An action calling `fetch` fails with the named guard error, while `t.fetch()` still invokes a local HTTP action.
8. The same page passes through the Vitest browser suite and through a served `storybook-static` smoke test under a non-root path.

If the overlapping identity or nested component checks fail, stop. Do not hide the failure by serializing only the test. Either keep all production bridge RPC serialized and document that limit, or replace the async-context shim with a browser-specific `convex-test` fork whose context propagation has its own conformance suite.

## Prototype results

The retained phase 2 prototype completed the following checks:

| Check | Result |
| --- | --- |
| Submit adjacent Alice, Bob, and signed-out requests through one client | Passed with the documented serialized RPC lane |
| Bootstrap a profile through the production mutation | Passed |
| Create a ruleset through the actual page and production mutation | Passed |
| Execute the three registered Aggregate mounts through application triggers | Passed |
| Replace the worker and verify an empty rulesets table 20 times | Passed |
| Create the same ruleset before and after worker replacement | Passed |
| Freeze and execute a named `fetch` rejection | Passed |
| Invoke local `t.fetch()` and its nested production `ctx.runQuery` | Passed |
| Run the page in Storybook development | Passed |
| Run the page from served `storybook-static` output | Passed |
| Serve the unchanged static preview below `/catalogue/` | Passed |
| Complete the browser suite | Passed, 98 files and 381 tests in 25.06 seconds |

Nested action context beyond the HTTP query, component authentication boundaries, scheduler authentication, rollback, and response CSP remain unproved. These are rollout gates, not hidden assumptions.
