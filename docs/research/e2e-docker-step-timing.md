# e2e_docker "Run Docker + Playwright E2E" step: where the time goes, and how to split it

Date: 2026-08-08

Follow-up to [ci-speed-and-architecture.md](ci-speed-and-architecture.md). Question: the
monolithic **Run Docker + Playwright E2E** step in the `e2e_docker` job
([`reusable-verify.yml`](../../.github/workflows/reusable-verify.yml), the `bun run e2e:local`
step) is the long pole of PR CI and shows up as one opaque duration in the Actions UI. Which part
of it is slow, and can it be split into workflow steps so the UI shows per-phase timing?

## Method

The step runs [`scripts/e2e-local.sh`](../../scripts/e2e-local.sh) (via `e2e:local` in
[`package.json`](../../package.json)), which prints a marker line before each phase. GitHub job
logs carry a per-line UTC timestamp, so phase durations fall out of
`gh api /repos/ndelangen/dunezone/actions/jobs/<job_id>/logs`. Sampled the five most recent
successful `PR CI` runs (2026-08-08, all with warm Playwright cache):

| PR run | `e2e_docker` job | Job total | Monolithic step |
| --- | --- | --- | --- |
| [31278080835](https://github.com/ndelangen/dunezone/actions/runs/31278080835) | 93154818854 | 3m21s | 140s |
| [31277157151](https://github.com/ndelangen/dunezone/actions/runs/31277157151) | 93152501942 | 4m47s¹ | 176s |
| [31276156066](https://github.com/ndelangen/dunezone/actions/runs/31276156066) | 93149895136 | 3m38s | 173s |
| [31275794171](https://github.com/ndelangen/dunezone/actions/runs/31275794171) | 93149011619 | 3m14s | 140s |
| [31274711385](https://github.com/ndelangen/dunezone/actions/runs/31274711385) | 93146324240 | 3m37s | 170s |

¹ Image-cache miss: `Generate image variants` ran for 54s in this run (0–11s elsewhere). That
variance lives in its own step already and is out of scope here.

The monolithic step is **140–176s of a 194–287s job** — everything else (checkout, bun install,
browser install, image gen, pre-pull wait) is already separate, visible steps totaling ~60s.

## Phase breakdown inside the step

Durations from log-line timestamps, median (range) across the five jobs above. Line numbers refer
to `scripts/e2e-local.sh` on `main`.

| # | Phase (script lines) | Median | Range | Share of step |
| --- | --- | --- | --- | --- |
| 1 | Clear artifacts, `compose down -v`, `compose up -d`, health wait (115–135) | 6.2s | 6.0–6.6s | 4% |
| 2 | Admin-key + JWT material generation (137–161) | 0.3s | 0.2–0.3s | <1% |
| 3 | 7× `convex env set` (163–170) | 5.5s | 4.4–6.2s | 3% |
| 4 | `convex deploy` (179–180) | 3.0s | 2.2–3.5s | 2% |
| 5 | `e2e:clearAll` + vite dev startup + readiness wait (182–227) | 3.8s | 3.3–5.3s | 2% |
| 6 | Playwright globalSetup: config compile + 7 parallel logins (230 → "Running 5 tests") | 31.5s | 27.5–32.5s | ~19% |
| 7 | Playwright test execution: 5 specs, 3 workers ("Running 5 tests" → "5 passed") | 117s | 93–123s | **~69%** |
| 8 | Teardown: `compose down -v` via `trap cleanup EXIT` (74–79, 113) | ~1s | 0.8–1.2s | <1% |

Sanity check: run 93154818854 sums to 139.6s against a 140s step.

**Test execution dominates (~69%), and within it a single spec is the wall-clock floor.** With
`workers: 3` ([`playwright.config.ts`](../../playwright.config.ts)), the phase ends ~1s after
`e2e/faction-lifecycle.spec.ts` finishes, which took **1.5m / 1.9m / 1.9m / 1.5m / 1.8m** across
the five runs — every other spec (≤48s) completes in its shadow. The 36s spread in step totals
(140s vs 170–176s) is almost entirely this one test's own variance; infra phases 1–5 vary by ≤2s
combined. All setup the script does before Playwright — Docker included — is **~19s total**.

## Can it be split into steps?

Yes, mechanically, and the two blockers people usually assume are non-issues here:

- **Env vars across steps.** Each `run` step is a fresh shell; values survive only via
  `$GITHUB_ENV` ([workflow commands: setting an environment variable](https://docs.github.com/en/actions/writing-workflows/choosing-what-your-workflow-does/workflow-commands-for-github-actions#setting-an-environment-variable)).
  Only two dynamic values cross phase boundaries: `CONVEX_SELF_HOSTED_ADMIN_KEY` (generated in
  phase 2; single line, write to `$GITHUB_ENV`, optionally `::add-mask::` — it's an ephemeral
  key for a throwaway local backend) and the JWT material, which the script already persists to
  `.playwright/*.pem`/`*.json` files on disk (lines 35–62), so it crosses steps for free.
  Multiline values would need the heredoc form
  ([multiline strings](https://docs.github.com/en/actions/writing-workflows/choosing-what-your-workflow-does/workflow-commands-for-github-actions#multiline-strings)).
- **Background processes across steps.** They keep running. This job already depends on that:
  the `Pre-pull Convex images in background` step starts `docker compose pull … &` and a later
  step waits on its marker file ([`reusable-verify.yml`](../../.github/workflows/reusable-verify.yml));
  measured, the wait step took 14s in job 93154818854 (pull still in flight several steps later)
  and 0–1s in the others. The vite dev server backgrounded in phase 5 would survive into the
  Playwright step the same way; the compose containers are daemon-managed anyway
  (`docker compose up -d`, [compose up reference](https://docs.docker.com/reference/cli/docker/compose/up/)).

Two real constraints:

- **Teardown moves from `trap` to a step.** The script's `trap cleanup EXIT` (line 113) can't
  span steps; the split needs a final `if: always()` step
  ([`always()` expression](https://docs.github.com/en/actions/learn-github-actions/expressions#always))
  running `docker compose -f docker-compose.convex-local.yml down -v` and killing vite (pid via
  `$GITHUB_ENV` or `pkill -f 'vite dev --port'`). Same guarantee, different mechanism.
- **globalSetup can't be split off by workflow steps alone.** Phases 6 and 7 both live inside one
  `npx playwright test` invocation — globalSetup is a Playwright config hook that runs inside the
  test command ([Playwright global setup docs](https://playwright.dev/docs/test-global-setup-teardown)).
  A step boundary can't fall between them without restructuring (e.g. moving the 7 logins into a
  standalone script run as its own step, with globalSetup reduced to reading the saved storage
  states). The log markers already time it, so this is optional.

### Proposed step layout

Per-step durations are shown directly in the run's log view
([using workflow run logs](https://docs.github.com/en/actions/monitoring-and-troubleshooting-workflows/using-workflow-run-logs)).
Keep `scripts/e2e-local.sh` as the single source of truth — give it phase subcommands
(`up` / `provision` / `serve` / `test` / `down`) so `bun run e2e:local` still runs all of them
locally, and CI calls one per step:

| Step | Script phase (lines) | Expected duration |
| --- | --- | --- |
| Boot Convex backend | 115–135 (`compose down -v` + `up -d` + health wait) | ~6s |
| Provision deployment | 137–183 (keys, `env set`×7, `convex deploy`, `clearAll`); export admin key to `$GITHUB_ENV` | ~10s |
| Start app server | 185–227 (vite dev in background + readiness wait); export `PLAYWRIGHT_BASE_URL`, pid | ~4s |
| Run Playwright E2E | 230 (`npx playwright test`) | ~150s |
| Teardown (`if: always()`) | 74–79 (`compose down -v`, kill vite, close browsers) | ~1s |

### What the split buys — and what it doesn't

**Visibility only.** Nothing in this step builds a Docker image (both Convex images are pinned by
digest in [`docker-compose.convex-local.yml`](../../docker-compose.convex-local.yml) and
pre-pulled in the background), so there is no `compose build`/`up` separation or buildx layer
cache to win; Playwright browsers and generated images are already cached in their own steps. The
split converts ~20s of setup into four honest step timings and isolates the ~150s Playwright step,
which makes regressions attributable at a glance (e.g. "provision got slow" vs "the suite got
slow") without downloading logs — but it moves zero seconds.

The actual speed levers, per the numbers above:

1. **`faction-lifecycle.spec.ts` is the job's wall-clock floor** (~90–115s, single serial test).
   Splitting it into 2–3 independent specs would let the existing 3 workers absorb it; ceiling is
   roughly test-phase ≈ longest remaining spec (~50s), i.e. **~60s off the job**. This supersedes
   the sharding fallback (#10) in [ci-speed-and-architecture.md](ci-speed-and-architecture.md) —
   sharding across runner jobs can't help while one test is the bound.
2. **globalSetup is ~30s** — compile + 7 logins that already run concurrently (first login alone
   ~6s, the remaining six land together ~17–18s later). Reducing login count (shared states) or
   pre-transpiling would shave part of this.
3. Phases 1–5 total ~19s with ≤2s variance; not worth optimizing further.

## Caveats

- All five samples had a warm `ms-playwright` cache (install step 2–4s). A cold cache adds
  ~20–30s to the separate `Install Playwright browsers` step, not to this one.
- One sample (93152501942) hit an image-cache miss (+54s in `Generate image variants`); job
  totals above include such per-job noise, the phase table does not.
- Timings are from public-repo `ubuntu-latest` hosted runners (4 vCPU — see
  [GitHub-hosted runners reference](https://docs.github.com/en/actions/reference/runners/github-hosted-runners));
  the animation spec already runs solo because workers compete for those cores
  ([`playwright.config.ts`](../../playwright.config.ts), `animation` project comment).
- Step durations were cross-checked against `gh run view <run> --json jobs`
  (`steps[].startedAt/completedAt`); phase durations come from log-line timestamps and carry
  ~1s quantization from the script's 1s polling loops.
