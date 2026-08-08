# Combined coverage from Vitest, Storybook, and Playwright via Codecov

Date: 2026-08-08. Tooling in this area (Storybook test story, Vitest browser mode, Codecov
pricing) churns quickly; every claim links its source as of this date. Follow-up to the coverage
section of [OSS code quality tooling](oss-code-quality-tooling.md), which recommended
`@vitest/coverage-v8` + Codecov for unit tests only — this doc answers the deeper question.

## Research question and summary answer

**Can coverage from (a) Vitest unit tests, (b) Storybook stories, and (c) Playwright e2e tests
be combined into a single per-PR coverage report via Codecov?**

**Yes — and without any local merge step.** Codecov merges every report uploaded for the same
commit server-side: "Codecov does not override report data for multiple uploads. We always merge
the data" ([Codecov: merging reports](https://docs.codecov.com/docs/merging-reports)). Each
suite emits an lcov file in its own CI job, each job runs `codecov/codecov-action@v5` with a
distinct `flags:` value, and the PR comment shows combined coverage plus a per-flag breakdown.
No suite needs to know about any other suite; nothing is merged locally.

Per-suite verdict:

| Suite | Feasible? | Mechanism | Verdict |
| --- | --- | --- | --- |
| Vitest unit (`test` + `publisher:test`) | Yes, trivially | `@vitest/coverage-v8`, lcov reporter | **ADOPT FIRST** (~1 h) |
| Playwright e2e (`e2e_docker`) | Yes, cleanly | Chromium V8 coverage → `monocart-coverage-reports` → lcov; zero app/build changes | **ADOPT SECOND** (~half a day), non-blocking flag |
| Storybook stories | Yes — support verified in Storybook source for the exact installed version | `@storybook/addon-vitest` (Vitest browser mode, Chromium) + `@vitest/coverage-v8` | **ADOPT THIRD**, timeboxed — the `tanstack-react` framework is the youngest piece |

One caveat found on pricing (detail in §1): Codecov's pricing matrix lists Flags, Carryforward
Flags, and Project Coverage outside the free Developer plan, while its OSS messaging says public
repos are "free forever … regardless of the number of users". The core of this design — server-
side merging into one combined report, patch coverage, PR comment — is on the free plan
regardless; flags only add the per-suite breakdown. If flags turn out to be gated for this repo,
the design degrades gracefully to "one combined number + patch coverage", which is still most of
the value.

## 1. The Codecov side: merge, flags, statuses, formats

**Merging.** Multiple uploads per commit are the explicitly supported model for "unit vs.
integration" splits and multi-language repos; Codecov merges them and deliberately delays PR
comments/notifications "until all reports are uploaded and merged"
([merging reports](https://docs.codecov.com/docs/merging-reports)). With three suites in three
jobs, the comment may still fire early if a job is slow; `codecov.notify.after_n_builds: 3` in
`codecov.yml` makes Codecov wait for all three uploads
([codecov.yml reference](https://docs.codecov.com/docs/codecovyml-reference)).

**Flags.** Tag each upload with one flag (`unit`, `publisher`, `storybook`, `e2e`); one flag per
upload — applying multiple flags to a single report attributes the whole report to each flag and
"produces incorrect results" ([flags](https://docs.codecov.com/docs/flags)). With
`comment: layout: "diff, flags, files"` the PR comment shows per-flag coverage alongside the
combined diff. `carryforward: true` per flag keeps the last known coverage for a suite when a
commit doesn't run it ([flags](https://docs.codecov.com/docs/flags)) — relevant if e2e coverage
is later made conditional (e.g. only on a label or on main).

**Statuses.** `codecov/project` and `codecov/patch` are separate checks; statuses can be scoped
per flag, and `informational: true` makes a status "pass no matter what the coverage is"
([commit status](https://docs.codecov.com/docs/commit-status)). The design below makes `patch`
the only opinionated check and keeps e2e/storybook flag statuses informational, so flaky or
skipped coverage never blocks a PR.

**Formats.** Codecov ingests `.xml`, `.json`, and `.txt` families; **lcov** is in the TXT
processor list ([supported formats](https://docs.codecov.com/docs/supported-report-formats)).
All three suites here can emit lcov, so format mixing doesn't even arise — but it also wouldn't
matter, since Codecov normalizes every format into its own line-based report before merging
([merging reports](https://docs.codecov.com/docs/merging-reports)). Mixing v8-derived lcov
(unit, storybook) with istanbul- or v8-derived lcov (e2e) is fine; merged data is line hit
counts either way. One practical requirement: all uploads must report the same repo-relative
paths (`src/app/...`, `workers/publisher/...`) so lines land on the same files — §4 covers the
one place this needs attention (module URLs from the Vite dev server).

**Token.** For a public repo uploading from non-fork branches, codecov-action v4+/v5 supports
tokenless uploads, and fork PRs are handled automatically (the branch is reported as
`fork:branch`) ([Codecov tokens](https://docs.codecov.com/docs/codecov-tokens),
[codecov-action](https://github.com/codecov/codecov-action)). Still, adding
`CODECOV_TOKEN` as a repo secret is the reliable path for pushes to `main` and avoids the shared
tokenless rate-limit pool; docs recommend the current action/CLI for dependable tokenless
uploads ([tokens](https://docs.codecov.com/docs/codecov-tokens)).

**Pricing caveat (verified 2026-08-08).** The free Developer plan's feature matrix includes PR
comments, status checks, and patch coverage, and lists Project Coverage, Flags, Components, and
Carryforward Flags under paid tiers ([pricing](https://about.codecov.io/pricing/)) — while the
pricing-change blog states Codecov is "entirely free for open source projects"
([pricing blog](https://about.codecov.io/blog/were-changing-our-pricing-model-at-codecov/)) and
the marketplace listing says "Always free for public repositories!"
([GitHub Marketplace](https://github.com/marketplace/codecov)). No doc states unambiguously
whether flags work on free public repos. Plan for it empirically: set the flags up (they cost
nothing to declare), and if per-flag data doesn't render, the merged totals and patch coverage
still work — that failure mode loses only the per-suite breakdown, not the combined report.

Proposed `codecov.yml`:

```yaml
codecov:
  notify:
    after_n_builds: 3 # unit, publisher, e2e (4 once storybook lands)
coverage:
  status:
    project:
      default:
        informational: true # visibility, not a gate
    patch:
      default:
        target: auto
        informational: true # flip to false once numbers stabilize
flags:
  unit:
    carryforward: true
  publisher:
    carryforward: true
  e2e:
    carryforward: true
comment:
  layout: "diff, flags, files"
```

## 2. Vitest unit coverage (flag: `unit`, `publisher`)

The straightforward part. Vitest 4's default provider is v8 (`npm i -D @vitest/coverage-v8`),
with AST-based remapping giving istanbul-level accuracy since v3.2, and `lcov` among the built-in
reporters ([Vitest coverage guide](https://vitest.dev/guide/coverage)). Config goes in the
existing `test` block of [`vite.config.ts`](../../vite.config.ts):

```ts
test: {
  exclude: [...configDefaults.exclude, 'e2e/**', '.claude/**'],
  coverage: {
    provider: 'v8',
    reporter: ['text-summary', 'lcov'],
    include: ['src/**', 'convex/**', 'workers/**', 'scripts/**'],
  },
},
```

By default only files imported by tests appear in the report; `coverage.include` forces
untouched files into the denominator ([coverage guide](https://vitest.dev/guide/coverage)) —
worth setting deliberately, since it decides whether "combined coverage" means "of tested files"
or "of the codebase".

**The two runs don't clobber each other in CI** because they live in different jobs (`test` and
`publisher_release` in
[`reusable-verify.yml`](../../.github/workflows/reusable-verify.yml)) on different runners; each
job uploads its own `coverage/lcov.info` with its own flag. Locally, running both would reuse
`./coverage`; `vitest run workers/publisher --coverage --coverage.reportsDirectory=coverage/publisher`
redirects the second run ([coverage guide](https://vitest.dev/guide/coverage)). Coverage runs
stay opt-in (`--coverage` flag) so day-to-day `bun run test` speed is untouched.

Upload step per job:

```yaml
- uses: codecov/codecov-action@v5
  with:
    files: coverage/lcov.info
    flags: unit # or publisher
    disable_search: true
```

## 3. Storybook story coverage (flag: `storybook`)

**Current state for Storybook 10:** story testing is the Vitest addon
(`@storybook/addon-vitest`); the legacy `@storybook/test-runner` still supports Storybook 10 but
its own README steers Vite projects to the Vitest integration
([test-runner repo](https://github.com/storybookjs/test-runner)). The addon turns stories into
Vitest browser-mode tests running in Playwright Chromium and "can also calculate project
coverage provided by your stories"
([Vitest addon docs](https://storybook.js.org/docs/writing-tests/integrations/vitest-addon)).
Coverage uses the standard Vitest providers — v8 (default) or istanbul
([test coverage docs](https://storybook.js.org/docs/writing-tests/test-coverage)); the v8
provider explicitly supports Chromium browsers
([Vitest coverage guide](https://vitest.dev/guide/coverage)), so the existing
`@vitest/coverage-v8` install is reused. Storybook 10 supports Vitest 4
([Storybook 10 announcement](https://storybook.js.org/blog/storybook-10/)); Vitest 4 browser
mode wants the `@vitest/browser-playwright` provider package
([Vitest browser mode](https://vitest.dev/guide/browser/)).

**Does it support `@storybook/tanstack-react`?** Verified in Storybook's source at the exact
installed version: the addon-vitest compatibility gate `SUPPORTED_FRAMEWORKS` includes
`SupportedFramework.TANSTACK_REACT` at tag v10.5.6
([AddonVitestService.constants.ts@v10.5.6](https://github.com/storybookjs/storybook/blob/v10.5.6/code/core/src/cli/AddonVitestService.constants.ts)),
alongside react-vite, sveltekit, etc. So the official setup path (`bunx storybook add
@storybook/addon-vitest`) should accept this framework.

**Maturity caveat — why this is phase 3, timeboxed.** The framework itself is new and its
tracking issue still lists open workstreams, with "Vitest + portable stories" literally marked
*Unknown* ([tracking issue #34284](https://github.com/storybookjs/storybook/issues/34284)), and
neither the framework docs
([TanStack React framework](https://storybook.js.org/docs/get-started/frameworks/tanstack-react))
nor the launch blog
([Storybook for TanStack React](https://storybook.js.org/blog/storybook-for-tanstack-react/))
mention the Vitest addon. The support-list entry says the gate is open, not that the combination
is battle-tested — the framework's router/server-fn mocking happens through Vite plugins that
must also apply inside the Vitest browser-mode pipeline. Also note documented coverage limits:
story coverage is whole-project only and reflects only code your stories exercise
([test coverage docs](https://storybook.js.org/docs/writing-tests/test-coverage)).

**Plan:** attempt `bunx storybook add @storybook/addon-vitest` (it wires a `storybook` Vitest
project referencing [.storybook/](../../.storybook/), including the custom
`viteConfigPath`), run `vitest run --project=storybook --coverage
--coverage.reportsDirectory=coverage/storybook` in the existing `storybook` CI job (add the
cached Chromium install that `publisher_release`/`e2e_docker` already use), upload with flag
`storybook`. **Timebox to half a day**; if the framework's mocking breaks under the addon,
defer — the stories still get build-verified as today, and nothing else in this design depends
on it. This also upgrades the `storybook` job from "does it build" to "do all stories render",
which is arguably worth more than the coverage numbers.

## 4. Playwright e2e coverage (flag: `e2e`)

Grounding facts from the repo: the e2e app is served by **`npx vite dev`** — not a built
preview — ([`scripts/e2e-local.sh`](../../scripts/e2e-local.sh) line 188), and both Playwright
projects use Desktop Chrome only ([`playwright.config.ts`](../../playwright.config.ts)). Both
facts make this much easier than the general case.

Options evaluated:

- **(a) `vite-plugin-istanbul` + `window.__coverage__` harvesting.** Works on the dev server,
  but the project "is looking for new maintainers" and only targets "the latest stable Vite
  version" ([vite-plugin-istanbul](https://github.com/iFaxity/vite-plugin-istanbul)) — Vite 8
  (rolldown-based) compatibility is unverified. It also changes the served code (istanbul
  instrumentation on every module) and needs harvesting glue plus an nyc report step.
  **SKIP** — more moving parts, more maintenance, slower app under test.
- **(b) Chromium V8 coverage + `monocart-coverage-reports` (MCR).** Playwright's
  `page.coverage.startJSCoverage()/stopJSCoverage()` is Chromium-only
  ([Playwright Coverage class](https://playwright.dev/docs/api/class-coverage)) — a non-issue
  here. MCR consumes the V8 entries directly, converts to istanbul when an istanbul-family
  format is requested, resolves sourcemaps (the dev server serves unminified modules with
  sourcemaps, satisfying MCR's stated Vite requirements), filters by URL
  (`entryFilter`/`sourceFilter` for `localhost:6001` app modules vs. node_modules), remaps
  paths to repo-relative via `sourcePath`, and emits `lcov`
  ([monocart-coverage-reports](https://github.com/cenfun/monocart-coverage-reports)). **ADOPT.**
  Zero changes to how the app is built or served; coverage is a pure add-on in the test runner.
- **(c) Do nothing in-browser, rely on Playwright built-ins.** Playwright has no reporting
  pipeline of its own; the Coverage class returns raw V8 data
  ([Coverage class](https://playwright.dev/docs/api/class-coverage)). Not an option by itself.

Implementation is one Playwright fixture (~30 lines, `e2e/coverage.ts`): extend `test` so each
test wraps in `startJSCoverage({ resetOnNavigation: false })` / `stopJSCoverage()` and appends
entries to an MCR instance keyed per worker; a global teardown (or `monocart-reporter`, MCR's
first-class Playwright reporter, which bundles this) generates `coverage/e2e/lcov.info`
([MCR](https://github.com/cenfun/monocart-coverage-reports)). Gate the whole fixture behind
`E2E_COVERAGE=1` so local runs and the perf-sensitive path stay untouched; the CI job sets it.

Known limitations to accept:

- **Client-side coverage only.** TanStack Start server-side code (SSR, `createServerFn`
  handlers) executing in the Node dev-server process is not seen by browser coverage. Those
  lines simply stay uncovered under the `e2e` flag; unit tests remain their coverage source.
- **The animation spec.** `page-header-transition.spec.ts` asserts per-frame animation samples
  and already runs isolated because it "starve[s] when parallel workers compete for CPU"
  ([`playwright.config.ts`](../../playwright.config.ts)). V8 precise coverage adds some
  in-page overhead; exclude the `animation` project from the coverage fixture to avoid
  flaking it.
- **`resetOnNavigation: false` is documented as discouraged** (coverage may not survive
  navigations in all cases, per the
  [Coverage class docs](https://playwright.dev/docs/api/class-coverage)); per-test start/stop
  bounds any loss to a single test's navigations.

**Perf cost:** V8 coverage is collection, not instrumentation — no code transform, no bundle
change; the cost is CDP bookkeeping plus entry serialization at `stopJSCoverage()`. Against a
job with a 35-minute timeout that spends most of its time on Docker pulls, Convex deploys, and
real user flows, this is noise. If it ever isn't, flag `e2e` has `carryforward: true`, so the
coverage-enabled run can move to main-only or label-triggered without breaking PR reports
([flags](https://docs.codecov.com/docs/flags)).

## 5. Prototype validation (2026-08-08)

All three legs plus the merge were validated hands-on in this repo (branch
`prototype/combined-coverage` — throwaway configs marked `*.prototype.*`; results below are from
real runs, not extrapolation).

- **Unit (Vitest v8 → lcov): works out of the box.** `bunx vitest run --coverage` with lcov
  reporter: 66.98% lines, 144 source files, repo-relative `SF:` paths. No config surprises.
- **E2E (Chromium V8 → MCR → lcov): works, with one non-obvious config detail.** A standalone
  Playwright spec against a bare `vite dev` (no backend needed — routes render their
  loading/error states and the modules still execute) collected 231 V8 entries; MCR emitted
  77 all-`src/` sources at 85.5% of touched lines, with line numbers verified against original
  TSX. **The gotcha:** Vite dev's inline sourcemaps record bare filenames (`AppShell.tsx`), so
  path-based `sourceFilter`s silently drop every JS module (only CSS survives). The fix is
  remapping via the `info.distFile` second argument of MCR's `sourcePath` callback — for
  transform-in-place dev modules the served URL path *is* the repo path:
  `sourcePath: (p, info) => (info?.distFile ?? p).replace(/^localhost-6001\//, '')`, then
  `sourceFilter: (p) => p.startsWith('src/')`. See `e2e/coverage-smoke.prototype.spec.ts` on the
  prototype branch for the working recipe.
- **Storybook (addon-vitest on `@storybook/tanstack-react`): works — the framework gate is
  real, not just open.** All 74 story files were discovered and ran as Vitest browser-mode
  tests in Chromium: **222 of 225 pass**; coverage emitted lcov (61.6% lines, 194 files). Two
  setup facts the official docs don't cover: (1) `storybook add @storybook/addon-vitest`
  registers the addon but did not scaffold the Vitest side; (2) the addon does **not** load the
  custom builder `viteConfigPath`, so the Vitest config must mirror
  `.storybook/vite.config.ts` (react plugin, `VITE_CONVEX_URL` define, tsconfig paths) or every
  story fails on CJS interop (`react-dom` `flushSync`). The 3 failures are story-level
  play-function issues (duplicate text match, tooltip portal timing), not framework problems —
  fix or skip those stories at adoption.
- **Merge: union semantics confirmed.** Merging the three lcov files: 335 files, 68.2% combined
  lines — higher than any single suite (67.0 / 61.6 / 59.6), 76 files covered by ≥2 suites,
  per-file hit-unioning correct (AppShell: unit 26/40 + e2e 42/46 → merged 42/46). One known
  cosmetic artifact: v8-vitest and MCR disagree slightly on which lines are executable (40 vs
  46 for the same file), so per-file denominators shift a little depending on which suites
  report it; Codecov merges per-line, so this is noise, not breakage.

Net effect on the plan: phase 3 (Storybook) is de-risked from "timeboxed, may abandon" to
"known-working with two documented setup steps"; the e2e fixture should copy the prototype's
`sourcePath`/`sourceFilter` recipe verbatim.

## 6. Adoption plan

In order, each independently shippable; stop anywhere and the earlier steps keep working.

| # | Step | Changes | Effort |
| --- | --- | --- | --- |
| 1 | **Unit coverage + Codecov** | Add `@vitest/coverage-v8`; `coverage` block in `vite.config.ts`; `--coverage` on the `test` and `publisher_release` job commands; two `codecov-action@v5` uploads (flags `unit`, `publisher`); `codecov.yml` from §1; `CODECOV_TOKEN` secret + Codecov app install | ~1 h |
| 2 | **E2E coverage** | Add `monocart-coverage-reports`; `e2e/coverage.ts` fixture gated on `E2E_COVERAGE=1` (excluding the `animation` project); env var + upload step (flag `e2e`) in `e2e_docker`; bump `after_n_builds` | ~half a day |
| 3 | **Storybook coverage** (timeboxed) | `bunx storybook add @storybook/addon-vitest` (brings `@vitest/browser-playwright`); Chromium install + `vitest run --project=storybook --coverage` in the `storybook` job; upload (flag `storybook`); bump `after_n_builds` | ~half a day; abandon without loss if the framework combination misbehaves |
| 4 | **Tighten** | After a few weeks of stable numbers: flip `patch` status to `informational: false`; consider per-flag `flag_management` statuses if flags render on the free plan | ~15 min |

## 7. Not worth it

- **Local merging (nyc merge, lcov-result-merger, MCR `inputDir` cross-job merge).** Codecov's
  server-side merge makes any artifact-passing/merge job pure overhead
  ([merging reports](https://docs.codecov.com/docs/merging-reports)). MCR's own multi-source
  merging ([MCR](https://github.com/cenfun/monocart-coverage-reports)) is the right tool only if
  Codecov is ever dropped for a self-hosted report.
- **`vite-plugin-istanbul` instrumentation.** Maintenance risk and unverified Vite 8/rolldown
  support ([repo](https://github.com/iFaxity/vite-plugin-istanbul)); the V8 route needs no app
  changes at all.
- **`@storybook/test-runner` + `@storybook/addon-coverage`.** Still works on Storybook 10 but
  is the legacy path; its own docs point Vite projects at the Vitest integration
  ([test-runner](https://github.com/storybookjs/test-runner)). Only revisit if the addon-vitest
  route fails the §3 timebox *and* story-run coverage is judged worth a second test stack.
- **Coverage gates on `e2e`/`storybook` flags.** E2e coverage measures which lines the happy
  paths touch — useful signal, terrible gate. Keep those statuses informational permanently
  ([commit status](https://docs.codecov.com/docs/commit-status)).
- **Blocking anything on day one.** All statuses start `informational: true`; the only long-term
  candidate for enforcement is combined `patch` coverage.

## 8. Post-adoption corrections (2026-08-08)

Recorded here because the denominator decision
([ticket #301](https://github.com/ndelangen/dunezone/issues/301)) is otherwise the authority:

- The include globs shipped narrower than decided: `src/**/*.{ts,tsx}` etc. instead of bare
  `src/**` — the bare globs pulled in non-code files (`workers/publisher/dist/**` local build
  output, `tsconfig.json`) and inflated the denominator to 42k lines. Consequence to know:
  a future `.js`/`.jsx`/`.mts` source file would silently drop out of the denominator until the
  extension list grows.
- The denominator lives in one module (`coverage-denominator.ts`) imported by both
  `vite.config.ts` and `vitest.storybook.config.ts`, per the repo's one-authority rule.
- `after_n_builds: 4` means a silently failed upload (`fail_ci_if_error: false`) silently
  withholds the PR comment for that push; accepted — statuses still post per upload, and the
  next push retries — documented in `codecov.yml`.
