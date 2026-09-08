# Play import provenance and handoff

This records the local-table import for [#1093](https://github.com/ndelangen/dunezone/issues/1093).
It is an implementation handoff dated 2026-09-08, not a claim that review, CI, merge, deployment,
or live verification has finished.

The [Stage A resolution](https://github.com/ndelangen/dunezone/issues/1017#issuecomment-5582155720)
is the integration contract. `/play` is public but unlinked, including for signed-out visitors and
authenticated non-administrators. That resolution supersedes the administrator-only recommendation
in the earlier source audit. It does not relax the identity or private-state requirements for later
multiplayer work.

## Source and file inventory

The source is `/Users/me/Projects/Dune/duneplay` at commit
`e593e959363f30b69aaef79a08f04adccfa34dd9`. Its `src/game` tree is
`bee7e8b0330c4bf3cbc1147b0b8205396ad148fd`. The destination branch started at
`c0c386597bbabf4444dc04fed58f499e0e8c642a`.

[play-import-files.json](play-import-files.json) records the source Git blob, SHA-256, byte count,
and destination path for every imported original. Hashes describe the original bytes read with
`git show <source-commit>:<source-path>`, not the adapted destination files. Git blob IDs use SHA-1;
the separate SHA-256 values hash the file contents directly.

The runtime import contains the 27 files identified by the
[source audit](https://github.com/ndelangen/dunezone/issues/1017#issuecomment-5581905131):
23 TypeScript files, one scoped stylesheet, and three runtime assets. Fifteen migrated test files
bring the import inventory to 42 files. All live under `src/app/routes/_app/play/`. The existing
print catalogue at `src/game` is unchanged by this import.

The inventory also records replaced entry files, omitted source tests and runtime files, the
original package and lockfile, historical planning documents, and hashes of locally retained dirty
planning files. It is a provenance record, not a second dependency manifest.

## Restore the source history

The complete-history bundle is `duneplay-source-e593e95.bundle`, 1,548,765 bytes. Its SHA-256 is
`2207b62ddaa269d55c5ba03e4bc1edf46d8a3182f559ebd8ab0d0e86ef2bf264`.
`git bundle verify` confirmed that it has no prerequisite commits.

The bundle is currently retained at
`/Users/me/Projects/Dune/dunezone-screenshots/issue-1093/duneplay-source-e593e95.bundle`.
The [published bundle](https://github.com/ndelangen/dunezone/releases/download/proof-assets/duneplay-source-e593e95.bundle)
is available from the repository's `proof-assets` release. GitHub reports the same SHA-256 and byte count.

The bundle contains these branch tips and their history:

| Branch | Commit |
| --- | --- |
| `main` | `e593e959363f30b69aaef79a08f04adccfa34dd9` |
| `research/dunezone-game-identity` | `685fd3306c5f89a3f106975ec9e717508b80e59e` |
| `research/dunezone-play-integration` | `e9f22181c3a0b7615ab661c6108aba689afcfff0` |

After obtaining the bundle, run these commands in a directory where `duneplay-restored` does not
already exist. Compare the first command's result with the SHA-256 above.

```sh
shasum -a 256 duneplay-source-e593e95.bundle
git clone --branch main duneplay-source-e593e95.bundle duneplay-restored
git -C duneplay-restored switch --detach e593e959363f30b69aaef79a08f04adccfa34dd9
git -C duneplay-restored rev-parse HEAD:src/game
git -C duneplay-restored branch research/dunezone-game-identity origin/research/dunezone-game-identity
git -C duneplay-restored branch research/dunezone-play-integration origin/research/dunezone-play-integration
```

The tree command must print `bee7e8b0330c4bf3cbc1147b0b8205396ad148fd`. The bundle preserves
committed source and research. It does not include working-tree edits or untracked files.

## Adaptation boundaries

The new `route.tsx` owns TanStack search validation and navigation. `search.ts` accepts the local
fixture's four, five, or six seats and defaults invalid input to six. `LocalTable.tsx` composes
`TabletopProvider` and `GameTable`. `ClientOnly` and React's lazy import keep the table renderer out
of server rendering and defer its browser load until the route mounts.

The route uses the shared `PageLayout` viewport-height contract. The imported `.dune-play` styles
stay inside the table, without the standalone page reset. The scene uses the four approved,
app-controlled Map, Left, Right, and Bottom views, with manual orbit, pan, and zoom disabled.
Scene cursor changes target its canvas. These are destination integration changes; the original
geometry, local state, and rendering dependencies remain traceable to the source inventory.

The import omits the standalone `main.tsx`, HTML entry, Vite configuration, global stylesheet,
`DunePlayApp` query-string multiplayer wrapper, comparison UI, and old `TabletopUi`. It also omits
the connection client, multiplayer provider, command transport, multiplayer tests, and the
research Worker projects. Their source remains in the bundle.

`ScenePresence`, the default presence context, and shared protocol types remain in the rendering
dependency graph. This does not connect a player. The local entry creates no connection, chooses
no network identity, starts no game Worker, and persists no game state. There is no Play access
query, administrator gate, game directory, or Convex game-state implementation in Stage A.

## Rendering versions and TypeScript integration

The source pins these runtime versions:

| Package | Source version |
| --- | --- |
| `@react-three/fiber` | `10.0.0-alpha.4` |
| `@react-three/drei` | `11.0.0-alpha.6` |
| `three` | `0.185.1` |
| `react`, `react-dom` | `19.2.8` |

The source package manager is `bun@1.3.14`. Its compiler is TypeScript `6.0.3`, with Vite `8.2.0`
and `@vitejs/plugin-react` `6.0.5`. The inventory records every original development dependency.
The destination keeps its existing React version contract and native TypeScript checker. It pins
the imported Fiber, Drei, and Three versions instead of upgrading the rendering stack.

Fiber's alpha declarations extend React's JSX element namespace globally. In this application,
that makes Mantine's polymorphic HTML types expand against Three's element catalogue. The import
therefore includes a declaration-only Bun patch for the pinned Fiber version. It removes those
global augmentations from `dist/index.d.ts`, `dist/legacy.d.ts`, and `dist/webgpu/index.d.ts`.
The patch does not change runtime JavaScript.

The route-local `three-jsx` runtime re-exports React's actual JSX functions and combines React's JSX
types with Fiber's exact `ThreeElements`. Only `TabletopScene`, `ScenePresence`, `TableFurniture`,
and `TableLabel` opt into it. `jsx-runtime.typecheck.tsx` checks valid scene and Mantine elements
and rejects invalid scene properties, geometry arguments, and HTML attributes. It also verifies
that Three element names do not become global React DOM element names.

The full application typecheck passed with native TypeScript after the reconciliation. The scoped
positive and negative type checks also passed. No application files or tests are excluded from
TypeScript to make it pass. The production publisher build and deployment dry run also pass with
the patch installed. The native browser checks below use the scoped runtime.

## Test migration and replacement evidence

The imported numerical and state tests now run in Vitest. The migration retains geometry,
interaction policy, furniture layout, camera poses, seat layout, physics, storm movement, trackers,
selection, dragging, stack operations, rotation, locks, and flip state coverage.

`usePieceFlipAnimation.test.tsx` uses a real React render and real Three groups. It mocks only the
frame scheduler and invalidation callback. It covers pre-frame face compensation, interpolation,
completion once, interrupted animation, and unmount cleanup. The source's subprocess and fabricated
React hooks are not carried over. The standalone URL-settings test is replaced by the destination's
TanStack search contract tests.

The three source-text assertion suites are deliberately absent, in line with
[ADR-0001](../adr/0001-contracts-over-expressions.md) and [ADR-0002](../adr/0002-confidence-stack.md).
Their original hashes remain in the inventory.

| Omitted suite | Destination evidence |
| --- | --- |
| `styleIsolation.test.ts` | Scoped stylesheet, viewport layout stories, and production-build browser checks. Catalogue navigation does not fetch WebGPU chunks; leaving Play restores the navigation's computed styles and document layout. |
| `textRenderingCompatibility.test.ts` | Real Canvas route stories, rendered badges, loaded Desdemona font, and matching native WebGPU screenshots at 1440x1000 and 900x1000. |
| `webGpuRenderingCompatibility.test.ts` | Numerical geometry tests, real-renderer stories, and native Brave interaction checks. The browser run reports no page exceptions, console errors, or game-network requests. |

Local validation completed during the import:

- `bun run test src/app/routes/_app/play` passed 16 files and 412 tests. The 15 migrated files
  contain 402 tests; the new search contract adds 10.
- `bun run storybook:test src/app/routes/_app/play/route.stories.tsx` passed both stories.
  They cover signed-out and non-administrator access, four views, seat setup, keyboard panel resize,
  Alt-only counters and blur cleanup, stack flip completion, disabled repeated flips, and storm controls.
- Scoped lint and formatting checks passed for the migrated tests and route stories.

Dependency installation and release verification use pinned Bun `1.3.14`. Headless Chromium used the real Three WebGL2 fallback,
not a fabricated renderer. Story teardown emitted the scheduler warning
`Root "root_0" not found; invalidation ignored.` This run is not native WebGPU console proof.

The native Brave run passed 13 interaction checks, including pointer capture, peel, whole-stack
carry, merge, cancellation, rotation, locking, animated card/token/deck/stack flips, repeat-flip
blocking, Alt release, fixed camera inputs, and SPA exit during a carry followed by clean reentry.
Blur cleanup used an explicitly dispatched event because the headless browser did not emit a
native focus change. The two scheduler warnings on exit trace to Drei and Fiber store updates
after the scheduler unregisters the root. They are not suppressed. The canvas and diagnostic clear,
and reentry creates a fresh fixture.

Browser evidence is retained under `dunezone-screenshots/issue-1093/`, with matching before-and-after
screenshots and JSON reports. The production Vite preview does not serve Worker-owned `/published`
images used by the real catalogue, so its 404s are separate from Play's bundled assets. Deployment
verification must use the real Worker. Storybook's synthetic pointer events and mocked router links
do not establish native gestures or navigation. The source audit's 436 Bun cases are historical
source evidence, not destination test results.

## Planning evidence and later work

The source working directory retains six dirty planning files: modified `CONTEXT.md` and five
untracked research notes. `local_planning_files` records their paths, byte counts, and current
SHA-256 values. No contents were imported, published, or added to the bundle. Their local hashes
identify the retained drafts; they are not a backup. Preserve that directory until its owner decides
what to do with the drafts.

Use the [live integration map](https://github.com/ndelangen/dunezone/issues/1007) and its resolutions
for current decisions. Relevant replacements for the draft planning material include the
[catalogue and table contract](https://github.com/ndelangen/dunezone/issues/1021#issuecomment-5568962078),
[retained game data and live image references](https://github.com/ndelangen/dunezone/issues/1013#issuecomment-5580073020),
[selective faction recapture](https://github.com/ndelangen/dunezone/issues/1021#issuecomment-5555032761),
and [path-based asset URLs](https://github.com/ndelangen/dunezone/issues/1042#issuecomment-5557599294).
Historical `FEATURES.md`, `RESEARCH.md`, and the source ADRs remain recoverable in Git without
turning superseded recommendations into destination rules.

The [staged delivery decision](https://github.com/ndelangen/dunezone/issues/1007#issuecomment-5581591744)
puts hosted multiplayer in Stage B. Stage A must finish review, CI, merge, deployment, and live
verification before that work ships. Stage B starts from the accepted per-game Durable Object
baseline retained in the bundle. It replaces fixture impersonation with verified administrator
connections and revocation, then measures the hosted path. The local provider and rendering
components are the integration points; this import does not choose a hosted authentication design.

[#1014](https://github.com/ndelangen/dunezone/issues/1014) owns the connection and revocation contract.
Credential issuance, scope, expiry, replay, reconnection, multiple tabs, sign-out, administrator
loss, account deletion, and deployment topology still need that decision. A game-scoped credential
exchange is a candidate. Direct forwarding or reuse of a Convex client token as a game Worker
credential is [explicitly excluded](https://github.com/ndelangen/dunezone/issues/1014#issuecomment-5540930051).
Private participant data and seat authority remain later-stage concerns under
[#1095](https://github.com/ndelangen/dunezone/issues/1095).

Stage C adds real-game creation, directory, and participation. The current four-to-six-seat fixture
is not the future two-to-eighteen-seat game contract. Stage A does not add mechanics, private hands,
seat claims, or network authority by implication.
