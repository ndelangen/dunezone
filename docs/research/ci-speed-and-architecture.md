# CI speed and architecture

Date: 2026-08-08

## Baseline

Measured PR CI after [#282](https://github.com/ndelangen/dunezone/pull/282): wall-clock
**~2.6–3.1 min**, critical path is the `e2e_docker` job in
[`reusable-verify.yml`](../../.github/workflows/reusable-verify.yml) (line numbers below refer to
`main`). Its phases:

| Phase | Measured |
| --- | --- |
| Browser install (`actions/cache` restore 6s + `npx playwright install --with-deps chromium` 19s) | ~25s |
| Convex compose boot (image pre-pulled in background) | ~7s |
| `convex deploy` + env pushes | ~9s |
| Vite dev startup + Playwright global-setup (7 sequential logins) | ~35s |
| Playwright tests, serial (`workers: 1`, 5 spec files) | ~79s |

Every other job finishes in ≤1.3 min in parallel; `publisher_release` (1.3 min) is the runner-up.
The repository is **public**, so GitHub Actions on standard hosted runners is free — "GitHub
Actions usage is free … for public repositories that use standard GitHub-hosted runners"
([GitHub Actions billing](https://docs.github.com/en/billing/concepts/product-billing/github-actions))
— and `ubuntu-latest` for public repositories is a **4-vCPU / 16 GB** machine
([GitHub-hosted runners reference](https://docs.github.com/en/actions/reference/runners/github-hosted-runners)).
Two consequences frame everything below: only wall-clock matters (compute is free), and there are
4 cores to spend inside the e2e job.

## Summary of candidates, ranked by expected saving / risk

| # | Candidate | Expected saving (PR wall-clock) | Risk | Verdict |
| --- | --- | --- | --- | --- |
| 1 | Playwright `workers: 2–3` against the shared backend | ~35–45s | Low-medium | **Do it** — specs are already isolated by design |
| 2 | Parallelize the 7 global-setup logins | ~15–20s | Low | **Do it** |
| 3 | Drop `--with-deps` from the e2e + publisher browser installs | ~19s per job | Low (fail-fast) | **Do it**, after a one-run `--dry-run` verification |
| 4 | `channel: 'chrome'` (runner's preinstalled Chrome) | ~25s (supersedes #3, +6s) | Medium | Skip — determinism cost outweighs the extra 6s |
| 5 | Cache Bun's global install cache | ~5–15s | Low | Cheap experiment; measure `bun install` first |
| 6 | `vite preview` (prebuilt) instead of `vite dev` | ~0 net | Medium | **Kill** as a speed play; revisit only if #1 shows transform contention |
| 7 | Merge small jobs (lint/typecheck/skip-guard) | 0 (public repo ⇒ free minutes) | — | **Kill** |
| 8 | deploy-main: build the Worker release in a parallel job | ~1.5–2.5 min off push→prod latency | Medium | **Do it** — biggest absolute win in the repo |
| 9 | Merge queue; stop re-verifying on main | ~3 min off push→prod latency | Medium-high (structural) | Consider after #8 |
| 10 | Shard e2e across 2 runner jobs (own backend each) | ~40s | Medium | Fallback if #1 proves flaky |
| 11 | Misc: backend-only compose, larger runners, cache-key notes | ≤ a few seconds | — | Notes only |

Ceiling: #1+#2+#3+#5 bring `e2e_docker` to roughly **~1.4–1.6 min**, at which point
`publisher_release` (1.3 min) becomes co-critical and further e2e work stops moving the
wall-clock. #3 also applies to `publisher_release`
([`reusable-verify.yml:162-163`](../../.github/workflows/reusable-verify.yml)), which keeps it
from becoming the new bottleneck.

## 1. Playwright `workers: 2–3` against the shared Convex backend

**What the knobs do.** With `fullyParallel: false`, Playwright still parallelizes **at the file
level**: "By default, test files are run in parallel. Tests in a single file are run in order, in
the same worker process" ([TestConfig.fullyParallel](https://playwright.dev/docs/api/class-testconfig)).
`workers` caps concurrent worker processes; the library default is "half of the number of logical
CPU cores" ([TestConfig.workers](https://playwright.dev/docs/api/class-testconfig)). The repo pins
`fullyParallel: false, workers: 1` ([`playwright.config.ts:12-13`](../../playwright.config.ts)).
Since each of the 5 spec files contains exactly one test, raising `workers` gives file-level
parallelism with no intra-file reordering; `fullyParallel` can stay `false`.

**Data-isolation audit of the 5 specs** (all on `main`):

- Reset/seed happen once, before workers start: `e2e:clearAll` runs pre-suite
  ([`scripts/e2e-local.sh:183`](../../scripts/e2e-local.sh)) and `e2e:seedBaseline` runs at the end
  of global setup ([`e2e/global-setup.ts:119`](../../e2e/global-setup.ts)); `clearAll`/`seedBaseline`
  wipe and reseed whole tables ([`convex/e2e.ts:74-89`](../../convex/e2e.ts)). Nothing clears
  between tests, so the suite is already written to tolerate leftover state — the same property
  parallelism needs.
- Every spec namespaces its data with a `Date.now()` suffix and distinct prefixes
  (`E2EAuthoringA…`, `E2EMembership…`, `E2ERuleset…`), and asserts via name-scoped locators or
  exact-URL slugs, not list counts (e.g. `ruleset-lifecycle.spec.ts` checks
  `getByRole('link', { name: uniqueName })` has count 0 after delete — safe with unrelated rows
  present).
- The only shared mutable-ish fixture is the seeded `e2ebaselineruleset`, which
  `faq-happy-path.spec.ts` appends a uniquely-named question to. No other spec touches FAQ data,
  and its one exact-count assertion ("Picked answers" = 1) counts data only that spec creates.
- Sessions: each spec `use`s its own storage-state file (`user-a-ruleset.json`,
  `user-a-faq.json`, `user-a-group.json`, …), minted as **separate login sessions** in global
  setup ([`e2e/global-setup.ts:77-117`](../../e2e/global-setup.ts)). That matters because Convex
  Auth rotates refresh tokens — a token is single-use (10s reuse window) and "using an 'old'
  refresh token will invalidate the whole session"
  ([Convex Auth: Advanced](https://labs.convex.dev/auth/advanced)). Distinct sessions per worker
  means no rotation interplay. One gap: `faction-lifecycle.spec.ts` and
  `page-header-transition.spec.ts` both fall back to the project default `user-a.json`
  ([`playwright.config.ts:27-29`](../../playwright.config.ts)). Refresh is unlikely inside a
  2-minute run, but the cheap fix is to give `page-header-transition` an empty storage state (it
  never needs auth — it visits `/privacy` and `/assets`).
- Backend concurrency: the compose file already raises
  `APPLICATION_MAX_CONCURRENT_{MUTATIONS,QUERIES,…}` to 16
  ([`docker-compose.convex-local.yml`](../../docker-compose.convex-local.yml)), ample for 3
  workers.

**Counterpoint, on the record.** Playwright's CI guide recommends `workers: 1` on CI "to
prioritize stability and reproducibility" and suggests sharding for wider parallelization
([Playwright CI guide](https://playwright.dev/docs/ci)). That advice assumes the old 2-vCPU
runner; a public-repo 4-vCPU machine running 2–3 Chromium workers plus Vite plus a Rust backend
is within budget. `page-header-transition` is the one timing-sensitive spec (samples header
heights across ~850ms of rAF frames) — under CPU contention its "more than 2 distinct
intermediate heights" assertion is the most plausible flake; watch it specifically.

**Expected saving.** 79s serial becomes bound by the slowest spec (the multi-step
`faction-lifecycle`, plausibly ~30s). `workers: 2` ≈ ~40–45s of tests (−35s); `workers: 3` ≈
~35s (−40–45s). Best single PR-CI win available.

**Sketch.**

```ts
// playwright.config.ts
fullyParallel: false,
workers: Number(process.env.PLAYWRIGHT_WORKERS ?? 2),
```

plus `storageState: { cookies: [], origins: [] }` on `page-header-transition.spec.ts`. Land at 2,
confirm a week of green runs, then try 3.

## 2. Parallelize the seven global-setup logins

Global setup performs **seven sequential** `loginWithLocalAuth` calls, each launching a fresh
Chromium, navigating the login form, and saving a storage state
([`e2e/global-setup.ts:15,77-117`](../../e2e/global-setup.ts)). The first login also pays the Vite
dev-server transform waterfall (see §6); the other six are pure ceremony repeated serially.

The sessions must stay **distinct** (see the refresh-token rotation rationale in §1 — do not just
copy `user-a.json` seven times; copies would share one token chain and trip reuse detection). But
distinct sessions can be *created* concurrently: launch one browser, open seven contexts, and run
the logins under `Promise.all`. Each login mints its own independent session server-side.

**Expected saving:** ~15–20s of the 35s phase (seven logins at ~3–5s each collapse to roughly the
slowest one, after a shared first-transform). **Risk:** low — transient contention on the dev
server during the first navigation; the existing 30-retry goto loop already absorbs slow starts.

## 3. Drop `--with-deps` from browser installs

**What it costs.** `playwright install --with-deps` always runs `apt-get update` +
`apt-get install -y --no-install-recommends <pkgs>`
([`dependencies.ts:112-115`](https://github.com/microsoft/playwright/blob/main/packages/playwright-core/src/server/registry/dependencies.ts)) —
the measured ~19s, paid on every run because apt state is not cacheable. It runs in both
`e2e_docker` ([`reusable-verify.yml:262-263`](../../.github/workflows/reusable-verify.yml)) and
`publisher_release` ([`reusable-verify.yml:162-163`](../../.github/workflows/reusable-verify.yml)).

**What Chromium actually needs vs. what the runner ships.** Playwright's dependency manifest for
`ubuntu24.04-x64` lists ~21 shared libraries for Chromium (`libasound2t64`, `libatk-bridge2.0-0t64`,
`libnss3`, `libgbm1`, `libxkbcommon0`, …) plus a `tools` set of font/X packages (`xvfb`,
`fonts-unifont`, `fonts-wqy-zenhei`, `xfonts-cyrillic`, …)
([`nativeDeps.ts:242-278`](https://github.com/microsoft/playwright/blob/main/packages/playwright-core/src/server/registry/nativeDeps.ts)).
The `ubuntu-24.04` runner image ships Google Chrome 150, Chromium 150, Edge, and Firefox
preinstalled ([runner-images Ubuntu 24.04 readme](https://github.com/actions/runner-images/blob/main/images/ubuntu/Ubuntu2404-Readme.md),
"Browsers and Drivers"), and installing those browsers via apt pulls in exactly the shared-library
set above as package dependencies. `xvfb` and `fonts-noto-color-emoji` are also in the image's
explicit apt list. The plausible gap is the exotic font packages (CJK/Thai/legacy X fonts) — which
affect glyph rendering only, and none of the five specs assert pixels.

**Failure mode is loud, not flaky.** At browser launch Playwright runs `ldd` over the browser
binaries and errors with "Host system is missing dependencies!" naming the missing libraries
([`dependencies.ts:213-235`](https://github.com/microsoft/playwright/blob/main/packages/playwright-core/src/server/registry/dependencies.ts)).
A runner-image update that removed a library would fail the job immediately with a named cause.

**Verification before committing.** `playwright install-deps` has a dry-run that simulates the
apt install and prints exactly which packages are missing, exiting non-zero if any
([`dependencies.ts:126-149`](https://github.com/microsoft/playwright/blob/main/packages/playwright-core/src/server/registry/dependencies.ts)).
Run once in a throwaway workflow step:

```yaml
- run: npx playwright install-deps chromium --dry-run   # prints missing packages, if any
- run: npx playwright install chromium                  # instead of --with-deps
```

**Expected saving:** ~19s off the e2e critical path, and the same off `publisher_release`
(which matters once e2e drops near 1.3 min). **Risk:** low; Playwright's own CI examples do use
`--with-deps` ([Playwright CI guide](https://playwright.dev/docs/ci)), so this is a deliberate
divergence justified by the preinstalled-browsers evidence and the fail-fast check. Note the same
guide says caching browser binaries is "not recommended" since restore ≈ download; the repo's
measurements (6s restore vs. a much longer download) already disproved that locally — keep the cache.

## 4. `channel: 'chrome'` — use the runner's preinstalled Chrome

Playwright "can operate against the branded Google Chrome and Microsoft Edge browsers available
on the machine" via `channel: 'chrome'`, supporting stable and beta channels
([Playwright browsers doc](https://playwright.dev/docs/browsers)). The runner ships Chrome
150.0.7871.128 ([runner-images readme](https://github.com/actions/runner-images/blob/main/images/ubuntu/Ubuntu2404-Readme.md)).
This would eliminate the browser download, the cache step, *and* the apt step — the full ~25s.

Trade-offs, per the same doc and the repo's shape:

- **Version drift:** "Each version of Playwright needs specific versions of browser binaries to
  operate." With `channel: 'chrome'` the browser version is pinned by the runner image's weekly
  refresh instead of `bun.lock` — CI and local dev drift apart, and a Chrome stable release can
  change behavior mid-week with no repo diff.
- Chrome's headless is "closer to a regular headed mode" than Chromium's headless shell — "expect
  different behavior in some cases."
- `global-setup.ts` launches `chromium.launch(...)` directly
  ([`e2e/global-setup.ts:15`](../../e2e/global-setup.ts)) and would need
  `channel: 'chrome'` too, or it still downloads bundled Chromium and the saving evaporates.

**Verdict: skip.** After #3 lands, this only buys the remaining ~6s (cache restore + pinned
download check) at the price of a nondeterministic browser under the suite's one
animation-timing-sensitive spec. Keep the deterministic, lockfile-pinned Chromium.

## 5. Cache Bun's global install cache

`oven-sh/setup-bun` caches **only the Bun binary**, nothing about dependencies
([setup-bun readme](https://github.com/oven-sh/setup-bun)). Bun keeps a global package cache at
`~/.bun/install/cache`; when populated, "Bun uses the cached copy instead of downloading it again"
([Bun install cache docs](https://bun.com/docs/install/cache)). Every one of the nine jobs runs
`bun install --frozen-lockfile` cold.

Sketch (e2e job first, since only it is on the critical path):

```yaml
- uses: actions/cache@v4
  with:
    path: ~/.bun/install/cache
    key: bun-cache-${{ runner.os }}-${{ hashFiles('bun.lock') }}
    restore-keys: bun-cache-${{ runner.os }}-
```

Cache semantics fit: "The default branch cache is available to other branches," 10 GB repo limit,
LRU eviction ([actions/cache readme](https://github.com/actions/cache)). The restore itself costs
a few seconds, so the net win is `install-time − restore-time`. The install phase wasn't isolated
in the #282 measurements — **measure `bun install` in a real run first**; if it's under ~10s the
cache is not worth its restore. Do *not* cache `node_modules` itself (lifecycle scripts and
platform-specific artifacts make that the classic false-savings move). Expected saving: ~5–15s,
low risk, one-step experiment.

## 6. `vite dev` vs `vite preview` for the e2e app server

The dev server "only transforms files as requested by the browser," creating an import waterfall
on first navigation to each route ([Vite performance guide](https://vite.dev/guide/performance.html));
`vite preview` statically serves a prebuilt `dist`
([Vite CLI docs](https://vite.dev/guide/cli.html)). So switching trades **build time up front**
(~30–45s, judging by the `generate_and_build` job) against **removed transform cost** spread over
global-setup (~first login) and each route's first visit during tests (~25–35s combined). The
`generate_and_build` artifact cannot be reused: `VITE_CONVEX_URL` is baked at build time and that
job builds with a placeholder URL
([`reusable-verify.yml:109-111`](../../.github/workflows/reusable-verify.yml)); an e2e build must
bake `http://127.0.0.1:3210`, and downloading a cross-job artifact would add a `needs` edge that
serializes the two jobs — worse than rebuilding.

**Verdict: kill as a speed play** — roughly cost-neutral on the critical path. Two reasons it may
still earn its keep later, in which case rerun the numbers: (a) if `workers: 3` shows transform
contention (several routes first-visited concurrently on 4 vCPUs), a static server removes that
CPU competition entirely; (b) prod-fidelity — tests would exercise the bundle users get. A
cheaper partial mitigation is [`server.warmup`](https://vite.dev/config/server-options.html#server-warmup)
for the login route + spec entry routes, which overlaps transform with the Docker boot/deploy
phase (~16s of otherwise idle dev-server time).

## 7. Merge the small jobs (lint / typecheck / convex_skip_guard)

The billing case does not exist for this repo: Actions is free for public repositories on
standard runners ([billing docs](https://docs.github.com/en/billing/concepts/product-billing/github-actions)),
and per-job minute rounding is a billed-minutes concept for private repos ("billable job execution
minutes … rounded up to the next minute",
[job execution time docs](https://docs.github.com/en/actions/how-tos/monitor-workflows/view-job-execution-time)).
Merging jobs would only serialize currently-parallel work and lengthen feedback per check.
**Verdict: kill.** Cosmetic option with zero time impact: fold `convex_skip_guard` (a ~1s node
script, [`reusable-verify.yml:22-32`](../../.github/workflows/reusable-verify.yml)) into `lint` as
an extra step to reduce check-list noise.

## 8. deploy-main: build the Worker release in parallel with verify

Today [`deploy-main.yml`](../../.github/workflows/deploy-main.yml) runs `verify` (the full
reusable workflow — a `needs: verify` gate waits for *all nine* of its jobs, i.e. ~3 min bounded
by e2e; see the caller/dependency pattern in
[reusing workflows](https://docs.github.com/en/actions/how-tos/sharing-automations/reuse-workflows)),
and only then starts a single sequential `deploy` job of ~20 steps
([`deploy-main.yml:22-131`](../../.github/workflows/deploy-main.yml)). The heavy middle of that
job is pure build work with no production side effects: image restore/generation, `publisher:assets`
(= app build + Storybook build + publisher Vite build + assemble, per the script in
[`package.json`](../../package.json)), assets check, source-exactness check, dry-run. Storybook
alone is ~1 min judging by the PR `storybook` job.

**Restructure:** hoist the build into a job with no `needs`, so it runs concurrently with verify;
gate only the side-effectful tail on both:

```yaml
jobs:
  verify: { uses: ./.github/workflows/reusable-verify.yml }
  build_release:        # no needs — runs alongside verify
    steps: [checkout, bun, install, image cache/generate, publisher:assets,
            publisher:assets:check, source-exactness check, release:dry-run,
            upload-artifact (dist/, storybook-static/, workers/publisher/dist…)]
  deploy:
    needs: [verify, build_release]
    environment: production
    steps: [checkout, bun, install, download-artifact,
            narrow-check, convex deploy, migrations, publication init,
            preflight, types:check, typecheck, wrangler deploy --strict, smoke,
            activate revisions, env set SITE_URL]
```

Ordering constraints preserved: Convex deploy/migrations still precede the Worker deploy, and
smoke/activate still follow it. The exactness check moves into `build_release` (same workspace
that ran the build). **Expected saving:** the ~1.5–2.5 min of build work overlaps verify, so
push→prod latency drops by roughly that amount, minus ~15–30s artifact upload/download.
**Risk:** medium — the deploy step must consume exactly the uploaded assets (the existing
`publisher:assets:check` re-verification in the deploy job covers drift), and artifacts count
against storage (free-tier quota; retention can be 1 day). This is the largest absolute latency
win anywhere in the pipeline.

## 9. Merge queue: stop re-verifying on main

The re-verify on push exists because squash-merge produces a commit that PR CI never tested. A
merge queue closes that gap: it validates "temporary branches with a special prefix" via the
`merge_group` event and "GitHub will merge all these changes into the base_branch once the checks
required by the branch protections … pass" — i.e. the commit that lands on main *is* the
validated changeset
([managing a merge queue](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/configuring-pull-request-merges/managing-a-merge-queue)).
With that in place, `deploy-main` could drop `needs: verify` (or keep one cheap smoke job),
removing the full ~3 min verify latency between merge and deploy start.

Costs: branch-protection/ruleset configuration ("Require merge queue"), adding `merge_group:` to
[`ci-pr.yml`](../../.github/workflows/ci-pr.yml) triggers, and — for a solo maintainer — the same
checks now run *before* the merge completes, so merge-click→main latency grows by the CI time the
deploy no longer pays. Net deploy latency improves; total time from "approve" to "live" is
unchanged unless combined with #8 (which stacks: queue removes verify, #8 overlaps the build with
nothing at all — the deploy job then starts near-immediately and only runs the sequential deploy
tail). **Verdict:** correct architecture, medium-high ceremony; do #8 first, adopt this when the
re-verify wait actually chafes.

## 10. Sharding e2e across runner jobs

Playwright's recommended wide-parallelization path is sharding across machines
([Playwright CI guide](https://playwright.dev/docs/ci)). Here each shard would pay the full stack
setup again (install + browser + compose boot + convex deploy + vite + global-setup ≈ 70–90s) for
~40s of tests per 2-way shard — each shard lands around 110s, saving ~40s, the same as
`workers: 2` but with double the setup compute (free) and **full backend isolation** per shard.
**Verdict:** not now; it's the fallback if shared-backend parallelism (#1) turns out flaky in
practice, since per-shard `docker compose` gives each worker set its own Convex instance with zero
spec changes.

## 11. Notes that didn't earn a section

- **Backend-only compose in CI:** the `dashboard` service
  ([`docker-compose.convex-local.yml`](../../docker-compose.convex-local.yml)) is unused by tests.
  `compose up -d backend` (and pre-pulling only the backend image) shaves the dashboard pull from
  the background window and its boot from `compose up`. Seconds at best — the pull is already
  overlapped — but free.
- **Larger runners:** "Larger runners are always charged for, even when used by public
  repositories" ([billing docs](https://docs.github.com/en/billing/concepts/product-billing/github-actions)).
  Paying real money to shave a ~3-minute pipeline is not warranted; the standard public 4-vCPU
  runner is what makes candidate #1 viable for free.
- **Concurrency groups:** PR CI already cancels superseded runs
  ([`ci-pr.yml:9-11`](../../.github/workflows/ci-pr.yml)) and deploys already serialize without
  cancellation ([`deploy-main.yml:11-13`](../../.github/workflows/deploy-main.yml)). Nothing to add.
- **Image-cache key breadth:** the `generated-images-*` key hashes `bun.lock`
  ([`reusable-verify.yml:44-49`](../../.github/workflows/reusable-verify.yml)), so *any* dependency
  bump regenerates all image variants in six jobs. If regeneration ever gets slow, narrowing the
  hash to the image toolchain's actual inputs is the lever; today it's off the critical path.
- **Self-hosted backend boot:** the compose boot is already ~7s; the self-hosted README offers no
  faster-boot mode — SQLite is the default state store and the flags are pass-throughs the compose
  file already exposes ([self-hosted README](https://github.com/get-convex/convex-backend/blob/main/self-hosted/README.md)).
  Nothing further to harvest here.
