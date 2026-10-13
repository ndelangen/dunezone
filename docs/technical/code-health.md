# Automatic code-health reports

The extra checks run through GitHub and CI. They need no manual review request or agent instruction.
All five tools use free offerings, and the workflows use standard GitHub-hosted runners for this
public repository. Axe-core is excluded.

## Source and test reports

The [Code health workflow](../../.github/workflows/code-health.yml) runs on source-changing pull
requests, weekly on Tuesday at 04:17 UTC, and when its configuration lands on `main`. It also has a
manual run button for checking configuration changes.

Semgrep Community Edition scans `src`, `convex`, `workers` and `scripts` with the community security
audit rules. It uses no account, API token, AI credits or hosted paid features. Generated files stay
out through [`.semgrepignore`](../../.semgrepignore). Findings appear in
[GitHub code scanning](https://github.com/ndelangen/dunezone/security/code-scanning), and the run's
`code-health` artifact retains the SARIF report. Fork PRs retain an artifact without trying to write
to the repository's security dashboard.

Stryker mutates `src/shared/play/loadTarget.ts` and runs its existing seam suite. This trial checks
the guards that keep load tests away from application deployments and bound their lifetime and
accounts. It uses a standalone Vitest configuration with relative imports and no application or
backend startup. The sandbox excludes the root tsconfig because Stryker's compiler API discovery
can resolve the native TypeScript package through Bun's shared dependency directory. The ordinary
application typecheck still uses the native compiler.

Stryker's instrumenter has a scoped Babel 8 override; the application build keeps Babel 7.
Run `bun run test:mutation` locally with Node 24. The artifact includes `mutation.html` and
`mutation.json`, which identify the code changes the tests missed. The mutation score is advisory;
an initial test failure or scanner failure still fails the reporting job. Mutation coverage stays
in this report, while Codecov keeps ownership of ordinary code coverage.

## Repository security

The [Scorecard workflow](../../.github/workflows/scorecard.yml) runs weekly on Wednesday at 04:43
UTC and when its configuration lands on `main`. It checks repository and workflow practices,
publishes findings to GitHub code scanning, and retains a SARIF artifact. Its published results
also appear in the [Scorecard viewer](https://scorecard.dev/viewer/?uri=github.com/ndelangen/dunezone).
It uses the workflow token and GitHub OIDC rather than a personal access token.

These reporting jobs are outside `ci_ok` and do not add required merge checks. Their findings need
source review before a fix; a score is not a reason to weaken a rule or rewrite working code.

## Dependency safety and updates

The Socket GitHub app checks dependency changes automatically and reports suspicious package
behaviour on PRs. Install it only on `ndelangen/dunezone` and keep the free plan. Its settings and
scan quota live in [Socket](https://socket.dev/dashboard).

The Renovate GitHub app reads [`renovate.json`](../../renovate.json). Routine updates run on Monday
before 07:00 in Amsterdam, after a seven-day release delay. One routine update PR stays open, with
at most one created per hour. Security fixes have a separate one-PR budget and form one group.
Development dependencies, GitHub Actions and local Convex images have separate groups.
Patched packages stay out of the ordinary development group, so they do not hold its updates for
approval. Storybook has its own approval group to keep its packages aligned with the router patch.
Major upgrades and packages with checked-in patches need approval in the Dependency Dashboard.
Automatic merging is off. Security updates can bypass the routine schedule under Renovate's
security-update behaviour.

Renovate owns automated update PRs. Dependabot security updates stay disabled and there is no
Dependabot version-update configuration, avoiding two bots proposing the same change. The existing
`bun audit` check remains in CI, alongside Socket's package-behaviour checks.
