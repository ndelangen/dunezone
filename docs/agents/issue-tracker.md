# Issue tracker: GitHub

Issues and specs for this repo live as GitHub issues. Use the `gh` CLI for all operations and infer `ndelangen/dunezone` from the configured remote.

## Conventions

- Create, read, comment on, label, and close issues with `gh issue`.
- Pull requests are not a triage request surface.
- When a skill says to publish something to the issue tracker, create a GitHub issue.
- When a skill names a ticket, fetch it with `gh issue view <number> --comments`.

## Wayfinding operations

- A Wayfinder map is an issue labelled `wayfinder:map`.
- Decision tickets are child issues labelled `wayfinder:research`, `wayfinder:prototype`, `wayfinder:grilling`, or `wayfinder:task`.
- Use GitHub sub-issues for map membership, falling back to a map task list only when sub-issues are unavailable.
- Use GitHub's native issue dependencies for blocking relationships, falling back to a `Blocked by:` line only when dependencies are unavailable.
- Claim a ticket by assigning it to the current GitHub user before beginning work.
- Resolve a ticket by posting its answer, closing it, and adding a linked gist of the decision to the map.
- The frontier consists of open, unassigned child tickets with no open blockers.

## A red CI run

- Read before any rerun. A failed job's artifact and log say what broke, and a rerun replaces them. For an e2e shard, download the `e2e-artifacts-<run>-shard-<name>` artifact and read the screenshot and the error context first ([#865](https://github.com/ndelangen/dunezone/issues/865)).
- Ask whether the PR's diff can reach the failing file. If it can, the PR is wrong and a push fixes it. If it cannot, the failure is a class with a mechanism to name, and it gets a ticket; "flake" is a label, not a finding.
- For a test with a results file (the unit, storybook, e2e and publisher suites all upload JUnit), read [the Codecov tests page](https://app.codecov.io/gh/ndelangen/dunezone/tests) first. It lists every test that failed and passed on the same commit, which is what a hand rerun produces, and a row with a flake rate above zero and no open mechanism ticket gets one.
- The deploy workflow, the drift audit and the dependency audit upload no results file, so their refusals are read from the run history. A job that hit its `timeout-minutes` shows as `cancelled`, the same conclusion as a concurrency cancel; the duration and the log's last line tell them apart. Each of those gates names its outcome on its last line, and an `expected:` line in the isolation job owns the refusal after it (see `docs/technical/operational-traps.md`).
- CI does not retry a test or a job. Playwright and Vitest run with zero retries and a failed job is never rerun on its own, so a failure is seen the first time; a retry there would hide a class, which the flake map ruled out ([#1045](https://github.com/ndelangen/dunezone/issues/1045)). The three network gates retry a transport attempt inside their step, bounded and logged as `attempt N of M`, and that is the only retry there is.
