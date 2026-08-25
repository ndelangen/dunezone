# Browser execution context for `convex-test`

## Decision

Prototype a browser-specific `convex-test` fork that carries an immutable execution frame explicitly through every test, function invocation, child call, fake service, and scheduled callback. Do not use an `AsyncLocalStorage`-shaped browser shim.

The fork is accepted only if it removes ambient execution state from the browser path and passes the conformance suite below. This is a research result, not proof that the fork is small. The current package makes four independent async-local stores part of its correctness model, and Convex server helpers still reach an ambient `global.Convex`. A browser fork must address both layers.

No available browser polyfill provides the same semantics as Node's `AsyncLocalStorage` for native `async` and `await`. TC39's `AsyncContext` is the correct eventual platform primitive, but it is a Stage 2 proposal whose web integration pull requests remain open. Waiting for that proposal is the lowest-maintenance long-term option, not a foundation that can ship now.

## Acceptance baseline

The #736 spike aliases `node:async_hooks` to a single-slot shim. Its `run()` stores the new value, waits for the returned promise, and restores the previous value in `finally`. That shape fails as soon as sibling scopes overlap.

I ran this minimal case in a Chromium module Web Worker through the spike's Vite setup and exact shim:

```ts
const result = await context.run('root', async () => {
  const branches = await Promise.all([
    component('statistics', 5),
    component('profileDiscovery', 15),
  ]);

  return { branches, after: context.getStore() };
});
```

Each `component()` enters its named store, awaits a timer, and reads the store again. The deterministic trace was:

```json
{
  "branches": ["profileDiscovery", "root"],
  "after": "statistics",
  "trace": [
    ["statistics:start", "statistics"],
    ["profileDiscovery:start", "profileDiscovery"],
    ["statistics:resume", "profileDiscovery"],
    ["profileDiscovery:resume", "root"],
    ["root:after", "statistics"]
  ]
}
```

The expected branch values were `statistics` and `profileDiscovery`, followed by `root`. The trace proves sibling component paths and the caller path can all be substituted by another live scope.

The full Dune sequence from #736 passed 40 immediate reruns in the same local browser harness. That does not disprove the leak. It means the application-level symptom depends on module-loading and scheduler timing, while the minimal overlap reproduces the mechanism on every run. No hosted Convex deployment was used.

This matches the defect fixed upstream in [`convex-test` #80](https://github.com/get-convex/convex-test/issues/80): parallel cross-component calls read a sibling component path. [PR #81](https://github.com/get-convex/convex-test/pull/81) replaced a shared function stack with an `AsyncLocalStorage<ExecutionContext>` that tracks component path, UDF path, and nesting depth. Replacing that store with a shared browser slot reinstates the fixed race.

## What the installed package requires

The repository currently installs `convex-test` 0.0.55 and Convex 1.43.0. The pinned 0.0.55 source is one 3,302-line TypeScript module. It contains four `AsyncLocalStorage` instances and 33 references to them:

- `nestedTxStorage` distinguishes top-level from nested transactions and carries the nested lock.
- `authStorage` keeps concurrent identities separate and removes authentication at component boundaries.
- `convexGlobalStorage` selects the in-memory world behind the permanent `global.Convex` proxy.
- `executionContextStorage` carries component path, UDF path, depth, and pagination count.

These stores are used across function invocation, the transaction manager, the global syscall proxy, authentication, component resolution, actions, HTTP actions, and scheduling. See the pinned [`convex-test` source](https://github.com/get-convex/convex-test/blob/925f5f848cf7a3a3d17a9fff798b3caca5de91c0/index.ts#L145-L147), its [execution store](https://github.com/get-convex/convex-test/blob/925f5f848cf7a3a3d17a9fff798b3caca5de91c0/index.ts#L2164), [transaction manager](https://github.com/get-convex/convex-test/blob/925f5f848cf7a3a3d17a9fff798b3caca5de91c0/index.ts#L2250-L2285), and [public test wrapper](https://github.com/get-convex/convex-test/blob/925f5f848cf7a3a3d17a9fff798b3caca5de91c0/index.ts#L2473-L2511).

The scheduler cannot merely inherit the caller's frame. Upstream issue [`convex-test` #112](https://github.com/get-convex/convex-test/issues/112) showed that real timers inherited stale nested-transaction state and later failed with already-committed or missing transactions. [PR #114](https://github.com/get-convex/convex-test/pull/114) fixed it by leaving the nested transaction store, starting scheduled work as a fresh top-level execution, and tracking each world's in-flight work.

The upstream maintainer's answer on [browser support issue #122](https://github.com/get-convex/convex-test/issues/122#issuecomment-4774402004) confirms the boundary: async-local storage fixed correctness defects and is unlikely to be removed; an explicitly referenced custom `ctx` is plausible; global helpers such as `createFunctionHandle` still make a complete ambient-state removal difficult; a large overhaul is not currently an upstream priority.

## Recommended fork shape

The browser entry should have no `AsyncLocalStorage` import and no shared mutable current frame. It should use these objects:

```ts
type World = {
  components: ComponentRegistry;
  scheduler: Scheduler;
  transactionManager: TransactionManager;
};

type ExecutionFrame = {
  world: World;
  auth: AuthFake;
  componentPath: string;
  udfPath: string;
  depth: number;
  nestedLock: NestedLock | null;
};
```

Every method returned by `convexTest()` closes over one `World`. `withIdentity()` derives a test handle with a different root frame. Function resolution accepts a frame. `ctx.runQuery`, `ctx.runMutation`, and `ctx.runAction` derive child frames and pass them directly. Fake database, storage, scheduler, and search methods close over the frame or the world they serve. Component entry derives an unauthenticated child frame, matching the current `authForComponent` behavior. A scheduled callback captures only its world and scheduled arguments, then creates a fresh unauthenticated top-level frame when it fires.

The fork should invoke the registered function's handler with a constructed fake context instead of relying on Convex's ambient syscall proxy. Convex registration objects expose the handler as `_handler`, but the fork must retain argument validation, return validation, `ConvexError` conversion, transaction limits, pending commit values, HTTP behavior, and component function resolution. If any required Convex helper still calls `global.Convex`, the fork needs an explicit runtime hook in Convex itself or must fail the conformance suite. Leaving a temporary global assignment around an asynchronous handler is the original bug in another form.

Dune's current Convex modules do not call `createFunctionHandle`, so that helper did not cause the #736 failure. It still belongs in the gate: accepting a fork that silently loses upstream behavior would make the next legitimate helper call a hidden correctness regression.

This is not a narrow alias patch. The minimum review surface is four stores, 33 call sites, the function invocation layer, the global syscall proxy, the scheduler, and any Convex helper that bypasses `ctx`. The likely maintenance unit is a pinned patch set over both `convex-test` and, if the syscall hook is needed, Convex. Upgrades should be deliberate and blocked until the browser conformance suite passes against the new versions.

### Cost profile

| Property | Explicit-frame fork |
| --- | --- |
| Source change | Reworks the four ambient stores and 33 references in `convex-test` 0.0.55, plus the invocation and global-helper boundary |
| Runtime cost | One small frame derivation per function boundary; no patch applied to every promise, timer, event, or network callback |
| Bundle cost | No context library beyond the fork; most fake database code remains the existing package |
| Browser support | Uses ordinary Worker JavaScript and does not depend on an unshipped engine feature |
| Upstreamability | The explicit `ctx` part matches upstream interest; removing every global requires an upstream design discussion |
| Maintenance risk | High until upstream accepts the abstraction; lower semantic risk than a silent context polyfill |

## Why the other approaches do not qualify

### Promise and timer patches

ECMAScript `await` attaches its continuation with the specification's internal [`PerformPromiseThen`](https://tc39.es/ecma262/#sec-performpromisethen) operation. It does not call a user-replaced `Promise.prototype.then`. The TC39 proposal states this consequence directly: native `async` and `await` bypass userland promises, so Zone.js cannot cover them without transpilation. Patching `then`, `setTimeout`, or both therefore misses native continuations. Adding `MessageChannel`, events, dynamic imports, and fetch expands the patch list without changing that limit.

One worker per story and a top-level mutex do not solve nested overlap. A single handler can call sibling components with `Promise.all`. Serializing a parent while it awaits a child either deadlocks or requires the same suspend-and-restore mechanism being sought.

### Zone.js and OpenTelemetry's zone context

Zone.js is maintained and documents patches for promises, timers, `EventTarget`, and `MessagePort`. The official 0.16.2 package contains a 36.1 kB minified browser module before compression. [OpenTelemetry's browser zone manager](https://github.com/open-telemetry/opentelemetry-js/tree/main/packages/opentelemetry-context-zone) is a context API over the same mechanism.

It would require transforming every relevant native async function into promise chains in both Vite development and static builds. That includes application Convex modules, component packages, `convex-test`, Convex registration code, scheduler callbacks, and future dependencies. One excluded or newly introduced native async function can corrupt state without an import or type error. The transform also changes stack traces and makes dependency optimization settings part of database correctness. That is too fragile for the foundation.

### `unctx` transform

[`unctx`](https://github.com/unjs/unctx#async-transform) offers a maintained Vite transform that restores context after each `await`, but only inside functions selected by wrapper or object-definition names. Its own documentation says plain async context is unavailable after the first `await`. The transform does not automatically define the required behavior for timers, event callbacks, scheduled fresh roots, component authentication boundaries, or Convex's global helpers. Covering the whole runtime would become a repository-specific compiler contract with the same silent omission risk as the Zone.js plan.

### TC39 `AsyncContext`

The [TC39 proposal](https://github.com/tc39/proposal-async-context) models the required behavior: variables propagate through native promise continuations and platform callbacks, while nested `run()` calls restore their callers. It is still [Stage 2](https://tc39.es/proposal-async-context/). Its [web integration tracker](https://github.com/tc39/proposal-async-context/issues/152) lists open HTML and Web IDL work and a draft DOM integration. It is the preferred replacement once Storybook's browser floor ships it, but it cannot support today's static bundle.

### Node or hosted bridges

A Node process can keep upstream `convex-test` unchanged, but a static Storybook deployment has no companion process. A local or hosted Convex backend changes the proposal into an external service and reintroduces shared state, provisioning, credentials, and availability. It also violates this spike's requirement that the static build run from its own assets.

## Conformance target for the prototype

The next prototype must pass the same suite in a Vite development server and a built Storybook served from a non-root base path. Run it in Storybook's supported Chromium, Firefox, and WebKit projects. No hosted development database is involved.

Each race case should run at least 100 seeded interleavings with zero context mismatches. A failure is a correctness failure, not a retryable test failure.

1. **World isolation:** run two `convexTest()` worlds concurrently. Their reads, writes, component registries, scheduler queues, identities, and rollback state never cross.
2. **Identity isolation:** overlap two `withIdentity()` handles. Each root function sees its own `tokenIdentifier`; a cross-component child sees no root identity; returning to the root restores the original identity.
3. **Component isolation:** keep the deterministic `statistics` and `profileDiscovery` sibling probe. Add nested root to component to second-component calls, parallel query and action branches, and a post-child assertion that the caller's component path, UDF path, and depth are restored.
4. **Transaction isolation:** cover a child mutation that commits, a child mutation that throws and is caught by its parent, a parent that later throws, parallel sibling nested calls, and two concurrent top-level mutations. Assert committed documents and pending commit placeholders, not only return values.
5. **Async sources:** resume a function after a native promise, `setTimeout`, `MessageChannel`, and dynamic import. Every resume must retain the same frame without global patching.
6. **Scheduled work:** schedule mutation to action to query and mutation chains with real and fake timers. Scheduled functions start as fresh top-level, unauthenticated executions in the correct world, and drain through that world's scheduler only.
7. **Global helpers:** include `createFunctionHandle` from a root and a component. A result that depends on a temporary ambient component path rejects the fork.
8. **Upstream parity:** port the upstream component, authentication, nested transaction, action, HTTP, and scheduler regression suites. Keep the upstream #80 and #112 cases unchanged where possible.
9. **Dune proof:** register the real Aggregate-backed components, seed the minimal profile and ruleset scenario, run the homepage and ruleset page queries concurrently, and drain scheduled work in the same worker. Repeat after resetting the worker and after terminating and recreating it.

The foundation may proceed only when this suite passes in development and the static build. If direct handler invocation cannot preserve upstream validation and syscall behavior, or if a required global helper cannot be made explicit, close the browser-runtime path and return to compact validated page fixtures.

## Sources

- [`convex-test` 0.0.55 source at the installed revision](https://github.com/get-convex/convex-test/blob/925f5f848cf7a3a3d17a9fff798b3caca5de91c0/index.ts)
- [`convex-test` browser support issue #122](https://github.com/get-convex/convex-test/issues/122)
- [`convex-test` component-path issue #80](https://github.com/get-convex/convex-test/issues/80) and [fix PR #81](https://github.com/get-convex/convex-test/pull/81)
- [`convex-test` scheduled transaction issue #112](https://github.com/get-convex/convex-test/issues/112) and [fix PR #114](https://github.com/get-convex/convex-test/pull/114)
- [TC39 AsyncContext proposal](https://github.com/tc39/proposal-async-context), [Stage 2 specification](https://tc39.es/proposal-async-context/), and [web integration tracker](https://github.com/tc39/proposal-async-context/issues/152)
- [ECMAScript `Await`](https://tc39.es/ecma262/#await) and [`PerformPromiseThen`](https://tc39.es/ecma262/#sec-performpromisethen)
- [Zone.js standard API patches](https://github.com/angular/angular/blob/main/packages/zone.js/STANDARD-APIS.md)
- [`unctx` async transform](https://github.com/unjs/unctx#async-transform)
