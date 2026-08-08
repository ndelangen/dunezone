# OSS code quality, repo health, and change-insight tooling

Date: 2026-08-08. Pricing and free tiers change; every claim below links its source as of this
date.

## Goal and constraints

More insight into the changes each PR makes, plus ongoing code-quality/repo-health upkeep, using
only tools that are free for a public repository. Constraints that shaped the verdicts:

- **Public repo on a personal account** (`ndelangen/dunezone`). Org-only features (GitHub Actions
  usage metrics, OpenSSF Allstar) don't apply; anything "free for OSS/public repos" does.
- **Bun is the package manager** (`bun.lock` text lockfile, `packageManager: bun@1.3.14`).
  Dependency tooling must parse `bun.lock` or it's useless here.
- **Oxc is the lint/format toolchain** (`oxlint --deny-warnings`, `oxfmt`) — anything whose main
  value is "runs ESLint for you" adds nothing.
- **CI is already strict and fast** (~2.6–3.1 min wall-clock, see
  [CI speed and architecture](ci-speed-and-architecture.md)): lint, format, typecheck (native
  tsc), Vitest, Storybook build, Playwright e2e, Worker release dry-run, migration guards,
  Cloudflare drift audit. What's *missing* is trend/diff insight (coverage, bundle size, dep
  changes), security scanning, and dependency automation — there is no Dependabot/Renovate
  config, no CodeQL, no coverage collection (no `coverage` config in
  [`vite.config.ts`](../../vite.config.ts), no `@vitest/coverage-*` package), and `.github/`
  contains only `FUNDING.yml` and the four workflows.

## Verdict summary

| Tool | Category | OSS price | Verdict |
| --- | --- | --- | --- |
| Renovate (Mend app) | Dependency updates | $0 plan, supports `bun.lock` | **RECOMMEND** |
| CodeQL default setup | Static analysis (security) | Free on public repos | **RECOMMEND** |
| Vitest coverage + Codecov | Coverage + PR diffs | Free for OSS | **RECOMMEND** |
| size-limit action | Bundle-size PR diffs | MIT OSS | **RECOMMEND** |
| OpenSSF Scorecard + badge | Repo health | Apache-2.0 OSS | **RECOMMEND** |
| Knip | Dead code/deps | ISC OSS | **RECOMMEND** |
| `oxlint --format=github` | PR annotations | Already installed | **RECOMMEND** (one flag) |
| Secret scanning + push protection | Leak prevention | Free on public repos | **RECOMMEND** (settings toggle) |
| osv-scanner | Vulnerability scan of `bun.lock` | Apache-2.0 OSS | **MAYBE** |
| octocov | Self-hosted coverage/CI trends | MIT OSS | **MAYBE** (alternative to Codecov) |
| Socket.dev | Supply-chain PR review | Free for OSS | **MAYBE** |
| StepSecurity Harden-Runner | CI egress monitoring | Free on public repos | **MAYBE** |
| CodeRabbit | AI code review | Free on public repos | **MAYBE** |
| SonarQube Cloud | Quality dashboard | Free for OSS | **MAYBE** |
| Qlty | Quality + coverage dashboard | Free for community OSS | **MAYBE** |
| Coveralls | Coverage | Free for OSS | SKIP (redundant with Codecov) |
| Codacy / DeepSource | Quality dashboard | Free for OSS | SKIP (redundant with oxlint+tsc) |
| Dependabot | Dependency updates | Free, built into GitHub | SKIP (weaker Bun story than Renovate) |
| reviewdog / danger.js | Review plumbing | OSS | SKIP (native `--format=github`; solo repo) |
| RelativeCI / bundlewatch | Bundle tracking | Free OSS tier / OSS | SKIP (size-limit covers it) |
| Trunk Flaky Tests | Flaky-test detection | Free ≤5 committers | SKIP for now |
| BuildPulse | Flaky-test detection | From $99/mo, no OSS tier | SKIP |
| FOSSA | License compliance | Free tier too gated | SKIP |
| Trivy | Container/IaC scanning | OSS | SKIP (no shipped containers) |
| Allstar | Org policy enforcement | OSS | SKIP (org-level; personal account) |

## 1. Dependency updates: Renovate over Dependabot

The repo has no automated dependency updates at all — no `.github/dependabot.yml`, no
`renovate.json`. This is the largest gap: 40+ direct dependencies plus 9 pinned `overrides` in
[`package.json`](../../package.json) are all updated by hand.

**Renovate** supports Bun explicitly: the bun manager matches `package.json` plus both lockfile
formats — "`/(^|/)bun\.lockb?$/`" covers `bun.lock` and `bun.lockb`
([Renovate bun manager docs](https://docs.renovatebot.com/modules/manager/bun/)). The hosted
Mend Renovate App is listed on the GitHub Marketplace with a single plan, "Renovate Community
Cloud — $0/month", for personal and org accounts, public and private repos
([GitHub Marketplace: Renovate](https://github.com/marketplace/renovate)); self-hosting via CLI,
Docker, or a GitHub Action is also supported
([running Renovate](https://docs.renovatebot.com/getting-started/running/)). Renovate also
updates GitHub Actions references and can maintain SHA-pins — relevant because
[`cloudflare-live-drift.yml`](../../.github/workflows/cloudflare-live-drift.yml) pins actions by
commit SHA (it runs on `pull_request_target` with secrets) while the other workflows use tags;
Renovate keeps SHA-pins current, which is what makes pinning sustainable.

**Dependabot** gained Bun support (Bun ≥ v1.1.39) but only for *version updates* — the supported
ecosystems table marks Bun as **not supported for security updates**
([Dependabot supported ecosystems](https://docs.github.com/en/code-security/dependabot/ecosystems-supported-by-dependabot/supported-ecosystems-and-repositories)).
Renovate's grouping, scheduling, and `overrides`-aware npm handling are also stronger.

**Verdict: RECOMMEND Renovate** (Mend app, `$0` plan). Config: a `renovate.json` with a schedule,
grouped minor/patch updates, and `helpers:pinGitHubActionDigests` if pinning all workflows.
Dependabot: SKIP, except it costs nothing to *also* enable GitHub's dependency graph + Dependabot
alerts in repo settings for advisory notifications.

**osv-scanner** (Google, Apache-2.0) closes the "no security updates for Bun" gap from the
scanning side: it reads `bun.lock` directly — listed among supported JavaScript lockfiles
alongside `package-lock.json`, `pnpm-lock.yaml`, `yarn.lock`
([osv-scanner supported lockfiles](https://google.github.io/osv-scanner/supported-languages-and-lockfiles/))
— and ships a reusable GitHub Actions workflow for scheduled and PR scans. **MAYBE**: worthwhile
as a weekly scheduled job; skip the per-PR mode to keep PR CI lean.

**Socket.dev** reviews dependency *changes* on PRs (malware, install scripts, typosquats — "70+
risk types") and "is and will always be free to use for open-source"; the free plan has
unlimited repos and 1,000 scans/month ([Socket pricing](https://socket.dev/pricing)). **MAYBE**:
genuinely differentiated (behavioral analysis, not just CVEs), but it's a GitHub App with broad
read access; adopt after the shortlist if supply-chain risk feels underserved.

## 2. Static analysis: CodeQL yes, quality dashboards optional

**CodeQL code scanning** is free for public repositories — code scanning is available for all
public repos on GitHub.com, and the CodeQL CLI "is free to use on public repositories"
([about CodeQL code scanning](https://docs.github.com/en/code-security/code-scanning/introduction-to-code-scanning/about-code-scanning-with-codeql),
[CodeQL CLI docs](https://docs.github.com/en/code-security/codeql-cli/getting-started-with-the-codeql-cli/about-the-codeql-cli)).
The `javascript-typescript` extractor covers the whole repo (app, Convex functions, Workers,
scripts) without a build. "Default setup" is enabled from the repo's Security tab and needs no
workflow file to maintain. It finds real bug classes oxlint doesn't attempt (taint tracking,
injection, prototype pollution). **RECOMMEND** — default setup, ~5 minutes, zero recurring cost.

Third-party dashboards all have free OSS tiers, but they overlap heavily with what oxlint +
native tsc + CodeQL already cover:

- **SonarQube Cloud**: free for open source projects
  ([SonarCloud pricing](https://www.sonarsource.com/plans-and-pricing/sonarcloud/)). Adds
  maintainability/duplication metrics and a PR quality gate. **MAYBE** — the only candidate here
  with genuinely additive metrics (duplication, cognitive complexity trends), at the cost of a
  new external gate on PRs.
- **Codacy**: "unlimited public repositories" free
  ([Codacy pricing](https://www.codacy.com/pricing)). Mostly re-runs linters. **SKIP**.
- **DeepSource**: "free for open-source projects, and always will be", 1,000 PRs/month
  ([DeepSource pricing](https://deepsource.com/pricing)). Same overlap. **SKIP**.
- **Qlty** (Code Climate's successor): free plan with 1,000 analysis min/month plus "free service
  for community-based open source projects"; covers lint, coverage, maintainability, duplication
  ([Qlty pricing](https://qlty.sh/pricing)). **MAYBE** — could serve as the coverage host instead
  of Codecov if one dashboard for both appeals; younger product, smaller ecosystem.

**Knip** deserves its own line: it finds unused files, unused exports, and unused dependencies,
is ISC-licensed OSS, and ships plugins for Vite, Vitest, Storybook, and Playwright — exactly this
stack ([knip.dev](https://knip.dev/)). For a repo with generated code and many scripts it needs a
one-time config to mark entry points, then a `bun run knip` CI job keeps dead exports and stale
deps from accumulating. **RECOMMEND**.

## 3. Coverage tracking and PR coverage diffs

Nothing is collected today. Two-step adoption:

1. **Collect**: add `@vitest/coverage-v8` and a `coverage` block (lcov reporter) to the `test`
   config in [`vite.config.ts`](../../vite.config.ts). Free, first-party Vitest.
2. **Report/diff** — pick one host:

- **Codecov**: the Developer plan is free with unlimited public uploads and unlimited users for
  open source, including PR comments, status checks, and patch coverage; caveat: the free plan
  lists "no project coverage, flags, components, or carryforward flags"
  ([Codecov pricing](https://about.codecov.io/pricing/)). Patch coverage (did *this diff* get
  tested?) is precisely the "insight into changes" being asked for, so the missing
  project-coverage feature matters little. Bonus: the free plan also lists **bundle analysis**,
  with a Vite plugin and PR comments on bundle-size changes
  ([Codecov bundle analysis](https://docs.codecov.com/docs/javascript-bundle-analysis)) — one
  vendor covering §5 too. **RECOMMEND**.
- **octocov** (MIT OSS action): coverage from LCOV, PR comments with diff vs. the default branch,
  badges, and trend history stored in the repo/Actions artifacts — plus code-to-test ratio, test
  execution time, and *custom metrics* ([octocov](https://github.com/k1LoW/octocov)). No SaaS, no
  token, data stays in the repo — very much this repo's self-contained-CI style, and its custom
  metrics could also record CI wall-clock trends (the metric
  [ci-speed-and-architecture.md](ci-speed-and-architecture.md) had to measure by hand).
  **MAYBE** — the principled alternative if avoiding a third-party app; less polished diff UX
  than Codecov.
- **Coveralls**: "always free for open source" ([Coveralls pricing](https://coveralls.io/pricing))
  but strictly less capable than either option above. **SKIP**.

## 4. Repo health and OSS best practices

- **OpenSSF Scorecard**: free, Apache-2.0; 16+ automated checks (branch protection, token
  permissions, dependency pinning, security policy…) scored 0–10, with an official GitHub Action
  and a README badge via `publish_results: true`
  ([ossf/scorecard](https://github.com/ossf/scorecard)). The repo already does well on several
  checks (least-privilege `permissions:` blocks, drift workflow pinned by SHA); Scorecard turns
  the rest into a maintained TODO list. **RECOMMEND** — the action plus badge is ~30 minutes.
- **Community health files**: no `SECURITY.md` or `CONTRIBUTING.md` exists (`.github/` holds only
  `FUNDING.yml` and workflows). Adding `SECURITY.md` is free, directly improves the Scorecard
  Security-Policy check, and gives vulnerability reporters a channel. **RECOMMEND** (trivial).
- **Secret scanning + push protection**: "secret scanning runs automatically for free" on public
  repositories
  ([about secret scanning](https://docs.github.com/en/code-security/secret-scanning/introduction/about-secret-scanning));
  enable push protection in Settings → Code security. Relevant given the deploy workflow handles
  Cloudflare and Convex deploy keys. **RECOMMEND** (settings toggle).
- **StepSecurity Harden-Runner**: monitors/blocks runner egress to catch supply-chain
  exfiltration; the Community tier is free but "does not support private repositories" — i.e.
  free precisely for this repo
  ([Harden-Runner docs](https://docs.stepsecurity.io/github-actions/harden-runner)). **MAYBE**:
  highest value on [`deploy-main.yml`](../../.github/workflows/deploy-main.yml) (the job holding
  `CLOUDFLARE_API_TOKEN`/`CONVEX_DEPLOY_KEY`); start in `audit` mode there only.
- **Allstar** (OSSF policy enforcement): installs at the org level; this is a personal-account
  repo. **SKIP**.

## 5. Change insights: bundle size and PR annotations

The Vite app ships through the Cloudflare Worker, so bundle growth is a real, currently-invisible
axis of every PR.

- **size-limit** (MIT, Evil Martians): "checks every commit on CI … and throws an error if the
  cost exceeds the limit"; its GitHub Action "comments and rejects pull requests based on
  Size Limit output", and the `@size-limit/file` preset measures arbitrary build files with
  Brotli/Gzip — e.g. `dist/client/assets/*.js` from the existing `app:build`
  ([ai/size-limit](https://github.com/ai/size-limit)). No external service, budgets live in
  `package.json`. **RECOMMEND**.
- **Codecov Bundle Analysis**: if Codecov is adopted for coverage anyway, its Vite plugin adds
  per-module bundle diffs in the same PR comment
  ([docs](https://docs.codecov.com/docs/javascript-bundle-analysis); bundle analysis appears on
  the free Developer plan per [pricing](https://about.codecov.io/pricing/)). Alternative to
  size-limit, richer breakdown, but SaaS-dependent.
- **RelativeCI**: "always free for open source organizations", 500 jobs/month
  ([RelativeCI pricing](https://relative-ci.com/pricing)). Nice dashboards; third service for
  what size-limit does locally. **SKIP**.
- **bundlewatch**: OSS but semi-maintained and needs its own auth wiring. **SKIP**.
- **oxlint `--format=github`**: oxlint's CLI supports a `github` output format that emits GitHub
  Actions annotations ([oxlint CLI docs](https://oxc.rs/docs/guide/usage/linter/cli.html)), so
  lint failures show inline on the PR diff instead of only in the job log. One flag on the
  existing `lint` script path in CI. **RECOMMEND** — this also makes **reviewdog** unnecessary
  for lint plumbing (**SKIP**).

## 6. CI insights and flaky tests

- **GitHub Actions usage metrics** are an organization-level feature — not applicable to a
  personal-account repo, and compute is free on public repos anyway (see
  [ci-speed-and-architecture.md](ci-speed-and-architecture.md)). What's worth tracking is
  wall-clock trend, which octocov's custom metrics can record into the repo (§3). **SKIP** as a
  product; use octocov if trend data is wanted.
- **Trunk Flaky Tests**: free tier up to 5 repo committers and 5M test spans/month, quarantining
  and PR comments included; no OSS-specific tier ([Trunk pricing](https://trunk.io/pricing)).
  The e2e suite is 5 serial specs that were just audited for isolation — flakiness isn't the
  current pain. **SKIP for now**; revisit if raising Playwright `workers` introduces flakes.
- **BuildPulse**: plans start at $99/month, no free or OSS tier listed
  ([BuildPulse pricing](https://buildpulse.io/pricing)). **SKIP**.

## 7. Code review aids

- **CodeRabbit**: "install CodeRabbit on a public repository, and receive free reviews forever
  for public repositories" ([CodeRabbit pricing](https://www.coderabbit.ai/pricing)). **MAYBE**
  — free AI review on every PR; the workflow here already leans on Claude-based review, so this
  is preference, not a gap.
- **danger.js**: MIT OSS, custom PR rules in JS. **SKIP** — its classic use cases (changelog
  nagging, PR-size warnings) are thin value on a solo-maintained repo, and each rule is CI code
  to maintain.

## 8. License and security scanning

- **FOSSA**: free tier caps at 5 projects/10 developers and reserves "automated license and
  vulnerability scanning" for paid plans ([FOSSA pricing](https://fossa.com/pricing)). **SKIP**.
- **Trivy**: solid OSS scanner, but aimed at container images/IaC; this repo ships a Worker, not
  images (docker-compose is local-dev only). osv-scanner (§1) covers the lockfile case with
  first-class `bun.lock` support. **SKIP**.

## Prioritized shortlist

| # | Adopt | Why first | Setup |
| --- | --- | --- | --- |
| 1 | **Renovate** (Mend app) | Biggest gap; only updater with solid `bun.lock` support; also maintains action SHA-pins | Install app + `renovate.json` (~30 min, then tune grouping) |
| 2 | **CodeQL default setup** | Free security analysis with zero workflow maintenance | Security tab toggle (~5 min) |
| 3 | **Vitest coverage + Codecov** | Patch-coverage PR comments = direct "insight into changes"; free bundle analysis rides along | `@vitest/coverage-v8` + coverage config + upload step + app install (~1 h). octocov instead if avoiding SaaS |
| 4 | **size-limit** on the Vite build | Makes bundle growth visible/blockable per PR | Budgets in `package.json` + action job (~30–60 min). Skip if choosing Codecov Bundle Analysis in #3 |
| 5 | **OpenSSF Scorecard + badge**, plus `SECURITY.md` and secret-scanning push protection | Repo-health baseline; turns best practices into a scored checklist | Action + `publish_results: true` + two settings toggles (~30 min) |

Next tier, in order: `oxlint --format=github` in CI (one flag), Knip (config session, then one CI
job), scheduled osv-scanner, Harden-Runner in audit mode on `deploy-main.yml`.

## Adoption status (2026-08-08)

- **CodeQL default setup**: enabled on the repo (Security → Code scanning). First scan completed;
  one `js/stored-xss` alert in the font-regression test harness, assessed as not
  attacker-reachable (local ephemeral test server), left open for triage.
- **`oxlint --format=github`**: adopted as the `lint:ci` script, used by the lint job in
  [`reusable-verify.yml`](../../.github/workflows/reusable-verify.yml).
- **Knip**: adopted with [`knip.ts`](../../knip.ts) (route/publisher/worker/scripts entry points)
  and a `knip` job in `reusable-verify.yml`. Requires generated images for the
  `assetMap.generated` import to resolve, so the job reuses the generated-images cache.
  Initial findings were cleaned up in full (~4,300 lines deleted): 21 dead files including the
  dreamrules book (feature intentionally shelved — recover the page text from git history when
  the book feature is redone), 8 unused dependencies, and ~112 unused exports/types. The three
  `@tanstack/*devtools*` packages are `ignoreDependencies` (imported only from commented-out
  dev-toggle code).
- **Renovate / dependency automation**: deliberately not adopted — maintainer prefers avoiding
  update-churn PRs; dependency health is not a current pain point.
