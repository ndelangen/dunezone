# Paperclip local pilot

Paperclip runs locally on Norbert's Mac and coordinates work across projects. One company, NoBird, shares a Coordinator, Engineer and Reviewer. Each project has its own repository, brief and task worktrees. GitHub remains the source of scope, blockers, claims, pull requests and delivery evidence.

Norbert approved the local setup on 8 October 2026. Claude Projects knowledge, desktop chats and cloud tasks do not automatically follow an agent into Paperclip. Bring useful decisions into a project brief or linked GitHub issue before assigning work. This pilot executes locally while the Mac is awake.

## Start and stop

Run this in a new terminal:

```sh
paperclipai run
```

Open <http://127.0.0.1:3100>. Stop the foreground process with Control-C after active tasks finish. No login service is installed. Instance data lives under `~/.paperclip/instances/default`, outside the repository.

The managed installation is pinned to Paperclip `2026.1005.0`. Its launcher uses Node `24.21.0` installed through nvm, without changing the project's default runtime. The launcher is `~/.local/bin/paperclipai`; `~/.local/bin` is on the interactive shell PATH. The server binds to `127.0.0.1`, with embedded PostgreSQL on port `54329`. [Installation](https://docs.paperclip.ing/guides/getting-started/installation/), [stable source](https://github.com/paperclipai/paperclip/tree/467125fafb47a8520856504fecc48d6e32055db1).

Take a backup before updating:

```sh
paperclipai db:backup
paperclipai update
```

Automatic database backups run every hour with 30 days of retention. Backups stay on this Mac. An update is a deliberate maintenance action, not part of starting work.

## Direct work through the team

Create a task in the relevant Paperclip project and assign it to Coordinator. Include the desired outcome and any GitHub issue or decision links. Coordinator reads the current project context, creates or selects a bounded GitHub issue, checks claims and blockers, and assigns implementation to Engineer. Reviewer checks both correctness against the issue and code quality against the repository rules.

For Dune Zone, follow the [GitHub tracker workflow](../agents/issue-tracker.md). A Paperclip lock does not claim the corresponding GitHub issue. Agents reread live claims and blockers before editing, then link their PR and evidence to both records. An unrelated desktop session's claim remains a reason to stop.

All roles use `codex_local` with the CLI engine and the company-shared OpenAI subscription connection. Claude Code `2.1.286` is also installed and signed in to the Max account. Paperclip shows both provider connections as Connected, and both adapter connection tests passed. The pilot team currently uses OpenAI. No additional API key is required. Paperclip launches a separate agent process; this desktop chat's browser, connectors and history are not automatically available to it. [Codex adapter](https://docs.paperclip.ing/adapters/codex-local).

Coordinator and Reviewer use a read-only permissions profile with network access for GitHub and Paperclip. Engineer can write in its assigned workspace and the Git metadata needed to fetch and commit. `dangerouslyBypassApprovalsAndSandbox` is explicitly false for all roles. These settings constrain file access. The GitHub connection in Paperclip controls which repositories the agents can access. Add each project repository to the GitHub app installation before assigning work. Pilot instructions require explicit task authorization for merging or deploying.

The host launcher at `~/.paperclip/bin/codex` stages profiles from `~/.paperclip/profiles` into the temporary Codex home that Paperclip supplies, then runs the installed desktop CLI. For a Dune Zone task, it grants the task's exact Git metadata directory only after checking the repository and `norbert/paperclip-` branch. It leaves the managed login credentials to Paperclip. In host GitHub mode, it reads the existing GitHub CLI login from the host configuration before launching, without saving the token in configuration. Desktop plugins and computer-use tools are disabled in these profiles. Other repositories need their own write policy before implementation.

Timers are off. Assignment, comments and explicit wakes can start runs. Each agent runs one task at a time, each run has a 30-minute limit, and daily limits are six Coordinator runs, eight Engineer runs and eight Reviewer runs. Subscription-included inference records zero dollar cost, so daily run limits matter more than dollar budgets for this setup. [Stable heartbeat implementation](https://github.com/paperclipai/paperclip/blob/467125fafb47a8520856504fecc48d6e32055db1/server/src/services/heartbeat.ts).

Start with one engineering task at a time across the portfolio. Add concurrency only after measuring resource use and confirming that task services and contexts remain separate. Agents cannot hire other agents or create skills. No recurring work is configured.

## Dune Zone worktrees

The primary checkout was behind the remote when the pilot started. Paperclip uses freshly fetched `real-origin/main` as its base and creates a branch under `norbert/paperclip-` for each task. Implementation never runs in the primary checkout.

The project execution policy is:

```json
{
  "enabled": true,
  "sharedWorkspaceConcurrency": "serialize",
  "defaultMode": "isolated_workspace",
  "allowIssueOverride": false,
  "workspaceStrategy": {
    "type": "git_worktree",
    "baseRef": "real-origin/main",
    "branchTemplate": "norbert/paperclip-{{issue.identifier}}-{{slug}}",
    "worktreeParentDir": "/Users/me/Projects/Dune/paperclip-worktrees",
    "provisionCommand": "bun run worktree:setup:paperclip"
  }
}
```

Enable isolated workspaces and worktree execution in Paperclip's experimental settings. Automatic branch reconciliation and dirty-worktree repair are disabled for this pilot. A failed freshness check needs an explicit resolution that preserves the task's work.

[Paperclip provisioning](../../scripts/paperclip-worktree-setup.sh) verifies the supplied task path and branch, runs the repository's freshness preflight, installs the frozen dependencies without dependency lifecycle scripts and prepares missing generated images, vectors and objects. It runs again when Paperclip reuses a task workspace. Engineer also runs the core freshness preflight at the beginning of each Dune Zone run. Read-only roles rely on successful host provisioning and inspect the assigned path and branch without installing dependencies or fetching inside their file sandbox.

[The freshness preflight](../../scripts/codex-worktree-setup.sh) fetches before checking the remote default branch. It accepts a task branch with its own commits when that branch contains the current fetched base. It preserves dirty edits. When upstream has advanced beyond the task's base, it refuses a dirty, attached or divergent checkout. Only a clean detached checkout can advance automatically by fast-forward. A failed fetch always stops the run.

[Real Git tests](../../scripts/worktree-freshness.test.ts) cover commit and dirty-edit preservation, fresh remote fetching, stale-base rejection, detached fast-forward, divergent history, failed fetches, and Paperclip task identity before dependency installation:

```sh
bun x vitest run scripts/worktree-freshness.test.ts
```

For backend work use `bun run app:dev --local`, as described in [the development workflow](../README.md). Each task owns its development services and must clean them up. Follow the existing focused checks, publisher release verification and browser-proof requirements. Paperclip's `done` status alone does not prove merge, deployment or production health.

## Native pilot validation

On 8 October 2026, Engineer completed phase one of [GitHub issue #1967](https://github.com/ndelangen/dunezone/issues/1967) in the native Paperclip run using the connected OpenAI subscription.
The assigned worktree was `/Users/me/Projects/Dune/paperclip-worktrees/norbert/paperclip-NOR-1-validate-dune-zone-provisioning-and-commit-resumption`, on branch `norbert/paperclip-NOR-1-validate-dune-zone-provisioning-and-commit-resumption`, starting at `647fa27179756fe1fc47fb42ae07b2838ed1df79`.

`bash scripts/codex-worktree-setup.sh` passed after fetching `real-origin/main` and confirmed that the task commits contain the current base, `c00cfd01b0e28ff37b873db5b9c31bc9a730ebc3`.
`bun x vitest run scripts/worktree-freshness.test.ts` passed all six tests in one file in 2.12 seconds.
After restarting Paperclip, phase two reused the same path and branch and preserved local commit `b2253961a8ca3bc403fbdccb7707b1e7c16bf940`. Host provisioning succeeded, fetched the current base and checked 729 dependency installs without changes. Engineer's separate freshness check passed, and the checkout stayed clean. The native validation task finished without pushing, merging or deploying.

## Add another project

Register a separate project with its repository URL, current purpose, entry documents, worktree base, provisioning command and delivery rules. Validate a read-only task before allowing implementation. The Coordinator must receive a project brief that identifies that repository's tracker and claim rules.

The Lost Hope is registered separately. Its native read-only assessment completed in a fresh isolated worktree, verified the GitHub repository and entry documents, and left the files unchanged. Implementation stays inactive until its tracker, claim rules and write policy are established.

DunePlay's current local checkout has no Git remote and contains unfinished changes, so it is not ready for the same worktree policy. Keep it outside the implementation queue until its intended source and base are resolved. Other projects should receive the same live inspection before activation. Do not copy Dune Zone's provisioning command into a repository that does not contain it.

The first setup work is tracked in [GitHub issue #1967](https://github.com/ndelangen/dunezone/issues/1967). Keep the installed configuration and this guide consistent when changing the pilot.
