# React compiler rollout

React Compiler 1.0.0 compiles the browser application's components and hooks through
`scripts/lib/reactCompiler.ts`. The app, Storybook and browser story tests share that
configuration. Existing `memo`, `useMemo` and `useCallback` calls stay in place.

The initial scope is `src/app/{db,pickers,routes,shell,ui,widgets}`. The print renderers,
`src/app/print`, the browser-local database runtime, stories and test files are outside
the scope. The Vite preset runs in client environments, so it does not compile the
server bundle or Convex functions. The standalone publisher renderer configurations
remain unchanged.

The compiler and its Babel integration are pinned. `REACT_COMPILER=off` disables the
transform for a build or test run. `REACT_COMPILER_DIAGNOSTICS=1` prints structured
compiler events, including successful compilation. Ordinary builds print diagnostics
for skipped or unsupported code. Compiler skips remain skips; enabling this transform
does not justify suppressing diagnostics or rewriting unrelated application code.

## Measurements on 2026-09-07

The baseline is commit `7614caf7250b51a0264b44917cbd8d570d8cee74`. Both variants use
production Storybook builds and the same browser-local database fixtures. Chromium
151.0.7922.34 ran headlessly on an Apple M1 Pro with fourfold CPU throttling. Each
sample types ` measured compiler comparison`, with 30 ms between characters and
350 ms to settle afterwards. One warmup is discarded; seven samples remain per
variant, alternating execution order. Input values are checked after every sample.
There were no browser page errors.

The values below are medians of Chrome's cumulative execution counters during the
typing interval. They measure CPU work across the whole input sequence, not per-key
latency or INP. [Individual samples](react-compiler-measurements.json) are retained.

| Scenario | Compiler off | Compiler on | Change |
| --- | ---: | ---: | ---: |
| Faction editor, JavaScript execution | 2580.6 ms | 352.9 ms | -86.3% |
| Faction editor, main-thread task time | 2820.8 ms | 535.1 ms | -81.0% |
| Thirty-page Rulebook, JavaScript execution | 1625.0 ms | 1525.1 ms | -6.1% |
| Thirty-page Rulebook, main-thread task time | 2014.5 ms | 1909.2 ms | -5.2% |

The faction result supports adoption. The Rulebook difference is small enough that
this run alone does not establish a meaningful improvement there. The compiler skips
some of the editor's ref-heavy functions; the existing page-measurement guard still
passes, with one edited Page remeasured after a keystroke.

| Build cost | Compiler off | Compiler on |
| --- | ---: | ---: |
| App build, wall time | 6.34 s | 13.40 s |
| Storybook build, wall time | 14.23 s | 20.29 s |
| All emitted app JavaScript, uncompressed | 2,340,788 bytes | 2,580,135 bytes |
| All emitted app JavaScript, gzip level 9 | 731,902 bytes | 828,860 bytes |

Build times are single local runs, excluding installation and asset generation.
The byte totals sum every emitted JavaScript file, including lazy chunks. They are
not a visitor's download size. The extra 96,958 compressed bytes are a cost.
Storybook loads extra application and testing machinery, so its network totals
cannot answer the visitor-download question.

Two additional production app builds used the public backend URL from the publisher
configuration. Fresh, signed-out Chromium pages loaded each local build against that
read-only backend. Both page headings appeared and neither variant reported a browser
page error. The table sums the JavaScript response bodies fetched for each route and
compresses them locally with gzip's default level. It excludes images, CSS and headers;
Cloudflare's actual transfer can differ with caching and compression negotiation.

| Cold route JavaScript, gzip estimate | Compiler off | Compiler on | Increase |
| --- | ---: | ---: | ---: |
| Homepage | 280,778 bytes | 291,495 bytes | 10,717 bytes, 3.8% |
| Faction catalogue | 314,502 bytes | 328,832 bytes | 14,330 bytes, 4.6% |

The app build logged 434 successful function compilations across 193 module IDs and
41 diagnostics across 18 skipped function locations. Module IDs include TanStack's
split routes. Diagnostics cover render-time ref access, hook order, existing lint
suppressions, and unsupported try/finally or assignment syntax. These are not 41 new
runtime failures, and successful compilation is not a performance measurement.

## Validation and remaining checks

- All 1,068 unit tests pass with compilation enabled.
- All 590 browser story tests pass, including editing, drag-and-drop, mutation-driven
  query updates and the thirty-page Rulebook measurement guard.
- Typecheck, lint, formatting, unused-dependency checks and publisher release
  verification pass. Publisher verification leaves the renderer manifest unchanged.
- The profile-edit test now uses a subscribing mutation mock. Changing a plain mock
  variable and rerendering its parent did not notify a memoized child. The account
  deletion test allows five seconds for its first lazy route compilation instead of
  Testing Library's default one-second wait.
- Three renderer stories initially exhausted their image-readiness waits during a
  run alongside the unit suite. They pass individually with the compiler on and off,
  and the complete browser suite passes when run on its own.
- The local Docker API did not answer `/_ping`, so production-build E2E against the
  disposable backend has not run locally. CI must cover that check before merging.
  Deployment and interaction measurements on the deployed site have not been performed.

## Reproduce the typing comparison

Install the frozen dependencies and generate the assets first, following `docs/README.md`.
Run the builds and measurement sequentially, without another build or test suite competing
for CPU. The benchmark serves only loopback HTTP and closes its browser and servers.

```bash
task_dir="$(mktemp -d /tmp/dunezone-react-compiler.XXXXXX)"
REACT_COMPILER=off bun run build-storybook -- --output-dir "$task_dir/baseline-storybook"
bun run build-storybook -- --output-dir "$task_dir/compiler-storybook"
bun scripts/measure-react-compiler.mjs "$task_dir"
```

The script writes `measurements.json` into that directory. To inspect compiler coverage:

```bash
REACT_COMPILER_DIAGNOSTICS=1 bun run app:build
```

The integration follows the [React installation guide](https://react.dev/learn/react-compiler/installation).
React recommends retaining existing manual memoization during adoption in its
[1.0 release guidance](https://react.dev/blog/2025/10/07/react-compiler-1).
