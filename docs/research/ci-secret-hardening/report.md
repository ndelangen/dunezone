# CI secret hardening for `deploy-main.yml`

Research against primary sources only (GitHub docs, Cloudflare/wrangler docs and source,
Convex docs), August 2026. Subject: `.github/workflows/deploy-main.yml` — push-to-main
deploy, `environment: production`, `permissions: contents: read` + `deployments: write`,
step-level `env:` for `CONVEX_DEPLOY_KEY`/`CONVEX_DEPLOYMENT` (six steps) and
`CLOUDFLARE_API_TOKEN`/`vars.CLOUDFLARE_ACCOUNT_ID` (two steps). Actions:
`actions/checkout@v5`, `oven-sh/setup-bun@v2.2.0`, `actions/cache@v4`.

---

## Q1 — Step-level vs job-level `env:` for secrets

### What each scope actually exposes

GitHub's workflow syntax defines the three scopes and their precedence
([workflow syntax reference](https://docs.github.com/en/actions/writing-workflows/workflow-syntax-for-github-actions)):

> "When more than one environment variable is defined with the same name, GitHub uses the
> most specific variable. For example, an environment variable defined in a step will
> override job and workflow environment variables with the same name, while the step
> executes."

Top-level `env` is "a `map` of variables that are available to the steps of all jobs in
the workflow"; `jobs.<job_id>.env` is available to all steps of the job;
`jobs.<job_id>.steps[*].env` only to that step. Env vars are injected into the **process
environment** of the step's process tree. The threat-model consequence:

- **Job-level env**: every step's process sees the secret — including the Node processes
  of third-party `uses:` steps. In this workflow that would be `oven-sh/setup-bun@v2.2.0`
  (third-party org) and `actions/cache@v4`. A compromised release of either would receive
  the Convex and Cloudflare credentials in its own environment with nothing further to do.
- **Step-level env**: only that one step's processes see it. `setup-bun` and `cache` run
  with no deploy credentials in their environment.

GitHub's security reference states the blast radius plainly
([secure use reference](https://docs.github.com/en/actions/reference/security/secure-use)):

> "A compromise of a single action within a workflow can be very significant, as that
> compromised action would have access to all secrets configured on your repository, and
> may be able to use the `GITHUB_TOKEN` to write to the repository."

The mitigations it prescribes are pinning ("Pinning an action to a full-length commit SHA
is currently the only way to use an action as an immutable release") and minimizing what
each step can see. It does not contain a literal sentence "prefer step-level env over
job-level env"; the closest official wording is scope minimization for the token and, for
secret transport ([use secrets how-to](https://docs.github.com/en/actions/how-tos/write-workflows/choose-what-workflows-do/use-secrets)):

> "Avoid passing secrets between processes from the command line, whenever possible.
> Command-line processes may be visible to other users (using the `ps` command) or
> captured by security audit events."

and from the secure-use reference:

> "Some jobs will use secrets as command-line arguments which can be seen by another job
> running on the same runner, such as `ps x -w`. This can lead to secret leaks."

### The npm-dependency scenario — where step-level scoping does *not* help

A compromised dependency executing **inside a `run:` step that legitimately holds the
secret** (e.g. a malicious transitive package invoked during `bun run convex:deploy`) sees
the env of its own process regardless of how narrowly the secret was scoped. Step-level
env protects against *other* steps, not against the code the secret-bearing step runs.

Two honest caveats worth recording:

1. **Same-UID inspection.** All steps in a job run as the same OS user on the same runner.
   A malicious *earlier* step (e.g. a postinstall script from `bun install`) can leave a
   background process that reads later processes' environments via `/proc/<pid>/environ`
   (same-UID access on Linux). Step-level env is defense-in-depth against incidental and
   passive exposure, not a hard isolation boundary within a job. GitHub does not document
   step scoping as a security boundary — the only boundary it documents is the job/runner.
2. This repo's install step is comparatively safe: Bun does not run dependency lifecycle
   scripts unless listed in `trustedDependencies`, so `bun install --frozen-lockfile`
   is not an arbitrary-code hook the way `npm install` is — but the deploy steps
   themselves still execute dependency code with secrets in env.

### Log leakage

Masking (Q2c below) applies identically at both scopes — it redacts by value, not by
scope. Scoping does not change what gets redacted; it changes which processes could print
the value at all.

**Verdict:** the workflow already uses step-level `env:` everywhere. This is the correct,
hardened configuration; the remaining exposure (dependency code inside secret-bearing
steps) cannot be fixed by env scoping, only by shorter-lived / narrower credentials (Q2, Q4).

---

## Q2 — Stronger patterns

### 2a. GitHub Environments

Protection rules available
([managing environments for deployment](https://docs.github.com/en/actions/managing-workflow-runs-and-deployments/managing-deployments/managing-environments-for-deployment)):

- **Required reviewers** — "Select up to 6 people or teams. Only one of the required
  reviewers needs to approve the job for it to proceed," with optional prevent-self-review.
- **Wait timer** — "Enter the number of minutes to wait" before the job proceeds.
- **Deployment branches and tags** — restrict which "branches and tags can deploy to this
  environment" via patterns.
- **Admin bypass control** — "Disallow bypassing configured protection rules."
- **Custom deployment protection rules** — "Enable any custom deployment protection rules
  that have been created with GitHub Apps."

Environment secrets are real isolation, not just labeling:

> "These secrets are only available to workflow jobs that use the environment.
> Additionally, workflow jobs that use this environment can only access these secrets
> after any configured rules pass."

And the security reference ties this directly to secret protection
([secure use reference](https://docs.github.com/en/actions/reference/security/secure-use)):

> "You can use required reviewers to protect environment secrets. A workflow job cannot
> access environment secrets until approval is granted by a reviewer."

**Fit for auto-deploy-on-main:** required reviewers and wait timers would reintroduce a
human gate that the repo deliberately removed (branch protection is the gate — issue #286,
noted in the workflow header). The rule that *does* fit is the **deployment branch
policy**: restrict `production` to `main` only. Combined with moving
`CONVEX_DEPLOY_KEY`, `CLOUDFLARE_API_TOKEN`, and `VITE_CONVEX_URL` from repository
secrets to `production` **environment** secrets, this means no workflow run on any other
ref — including a compromised PR workflow or a new workflow added on a branch — can ever
obtain the deploy credentials. Repository secrets have no such guard: "Any user with
write access to your repository has read access to all secrets configured in your
repository" (secure use reference). Plan caveat: "Users with GitHub Free plans can only
configure environments for public repositories" — irrelevant here as long as the repo
stays public; if it goes private on a Free plan, protection rules are ignored.

The job already declares `environment: production`, so the workflow needs **zero changes**
— only dashboard moves. (Side note: `environment: <name>` with `deployment: false` exists
for jobs that want env secrets without creating a deployment record —
[deploy-to-environment docs](https://docs.github.com/en/actions/how-tos/write-workflows/choose-what-workflows-do/deploy-to-environment)
— not needed here, this job is a real deployment.)

### 2b. OIDC

GitHub's side is ready
([OIDC concepts](https://docs.github.com/en/actions/concepts/security/openid-connect)):

> "With OIDC, your cloud provider issues a short-lived access token that is only valid
> for a single job, and then automatically expires."
> "After you have established a trust connection with a cloud provider that supports
> OIDC, you can configure your workflow to request a short-lived access token directly
> from the cloud provider."

**Cloudflare: no first-party OIDC exchange — confirmed.** The Workers CI/CD docs
([GitHub Actions guide](https://developers.cloudflare.com/workers/ci-cd/external-cicd/github-actions/))
prescribe static credentials only: "Since CI/CD environments are non-interactive, Wrangler
requires a Cloudflare API token and account ID," with the "Edit Cloudflare Workers"
template and "We recommend scoping these down as much as possible to limit the access of
your token." The [`cloudflare/wrangler-action`](https://github.com/cloudflare/wrangler-action)
README's only auth inputs are `apiToken` (+ `accountId`); no OIDC anywhere. Cloudflare's
OIDC documentation exists only for Cloudflare One identity-provider integration, not for
API authentication. There is no token-exchange endpoint in the Cloudflare API auth docs.
What Cloudflare *does* offer to shrink the static-token risk:
[account-owned tokens](https://developers.cloudflare.com/fundamentals/api/get-started/account-owned-tokens/)
(service-principal tokens not tied to a user, survive user departure, Super Admin-managed)
and, on any token, **TTL and client-IP filtering**
([create token docs](https://developers.cloudflare.com/fundamentals/api/get-started/create-token/)).
IP filtering is impractical for GitHub-hosted runners (no stable egress); TTL means
scheduled manual rotation.

**Convex: no OIDC or auto-expiring credential either.** The
[deploy key types docs](https://docs.convex.dev/cli/deploy-key-types) describe only static
keys. Keys are long-lived until revoked (dashboard delete, or
`npx convex deployment token delete` —
[CLI reference](https://docs.convex.dev/cli/reference/deployment)); no documented
expiration on deploy keys. The short-of-long-lived options Convex does offer are
**permission scoping** (Q4) and cheap mint/revoke via
`npx convex deployment token create <name> [--deployment <ref>]`, which "creates a deploy
key that, when set as `CONVEX_DEPLOY_KEY`, scopes all commands to the target deployment."

### 2c. Secret masking

Mechanism ([secrets concepts](https://docs.github.com/en/actions/concepts/security/secrets)):
"GitHub Actions automatically redacts the contents of all GitHub secrets that are printed
to workflow logs" — by exact-value matching within the current job. Values derived at
runtime can be registered for masking with `::add-mask::`. Official pitfalls, quoted from
the [secure use reference](https://docs.github.com/en/actions/reference/security/secure-use):

> "Because there are multiple ways a secret value can be transformed, automatic redaction
> is not guaranteed."
> "Structured data can cause secret redaction within logs to fail, because redaction
> largely relies on finding an exact match for the specific secret value. For example, do
> not use a blob of JSON, XML, or YAML (or similar) to encapsulate a secret value."
> "If your secret is transformed in some way (such as Base64 or URL-encoded), be sure to
> register the new value as a secret too."
> "It's not always obvious how a command or tool you're invoking will send errors to
> `STDOUT` and `STDERR`, and secrets might subsequently end up in error logs."

Repo-specific observations:

- `CONVEX_DEPLOY_KEY` values are structured (`prod:deployment-name|eyJ2...=` per the
  [deploy key docs](https://docs.convex.dev/cli/deploy-key-types)) but stored whole, so
  exact-match redaction works — as long as no tool prints only the base64 half.
- **`CONVEX_DEPLOYMENT` and `VITE_CONVEX_URL` are not actually secret.** The deployment
  name is already public in `workers/publisher/wrangler.jsonc` `vars`
  (`CONVEX_EXECUTOR_BASE_URL: https://exuberant-finch-263.eu-west-1.convex.site/...`),
  and `VITE_CONVEX_URL` is baked into the shipped client bundle. Keeping them as secrets
  buys nothing and costs something: every log line containing the deployment name gets
  partially `***`-redacted (noise that hampers debugging) and gives false comfort.
  These belong in `vars`, like `CLOUDFLARE_ACCOUNT_ID` already is.

---

## Q3 — `persist-credentials` and GITHUB_TOKEN permissions

### `persist-credentials: false`

From the [actions/checkout README](https://github.com/actions/checkout): the input is
"Whether to configure the token or SSH key with the local git config," **default `true`**.
On v5 (this workflow's version), "The auth token is persisted in the local git config.
This enables your scripts to run authenticated git commands. The token is removed during
post-job cleanup." So for the entire job, the `GITHUB_TOKEN` sits in
`.git/config` readable by **every subsequent step and every dependency those steps
execute** — the exact population step-level `env:` was keeping secrets away from. v6
changed this ("`persist-credentials` now stores credentials in a separate file under
`$RUNNER_TEMP` instead of directly in `.git/config`"), which reduces accidental
exposure/commit of the config but is still same-UID readable.

What it protects against here: a compromised action or npm dependency exfiltrating a
`contents: read` token — enough to clone a private repo and to read anything the token
can read for its ~job lifetime. This repo appears public, so the *confidentiality* value
is modest, but the cost is zero: no step after checkout performs authenticated git
operations (`git diff` / `git ls-files` in the "Verify release build kept merged source
exact" step are purely local). `persist-credentials: false` is therefore free hardening.

### GITHUB_TOKEN permissions — is `deployments: write` needed?

- Baseline rule ([controlling permissions for GITHUB_TOKEN](https://docs.github.com/en/actions/writing-workflows/choosing-what-your-workflow-does/controlling-permissions-for-github_token)):
  when the `permissions` key is used, "all unspecified permissions are set to no access,
  with the exception of the `metadata` scope, which always gets read access" (wording per
  [github/docs#35810](https://github.com/github/docs/issues/35810), merged into the docs).
- The `deployments` scope is defined in terms of **API use**: "`deployments: write`
  permits an action to create a new deployment" — i.e., calling the
  [Deployments REST API](https://docs.github.com/en/rest/deployments/deployments)
  ([workflow syntax reference](https://docs.github.com/en/actions/writing-workflows/workflow-syntax-for-github-actions)).
- The deployment record you see for this job is **not** created via the token. When a job
  references an environment, the Actions service creates the deployment object
  automatically — users have repeatedly asked for a way to *stop* it doing so regardless
  of token permissions ([actions/runner#2120](https://github.com/actions/runner/issues/2120),
  [community discussion #36919](https://github.com/orgs/community/discussions/36919)),
  which is why the `environment.deployment: false` opt-out was added
  ([deploy-to-environment docs](https://docs.github.com/en/actions/how-tos/write-workflows/choose-what-workflows-do/deploy-to-environment)).

No step in `deploy-main.yml` calls the deployments (or any GitHub) API. Conclusion:
`deployments: write` is unused surface. GitHub's own hardening guidance is to grant least
privilege ("It's good security practice to set the default permission for the
`GITHUB_TOKEN` to read access only for repository contents. The permissions can then be
increased, as required, for individual jobs" —
[secure use reference](https://docs.github.com/en/actions/reference/security/secure-use)).
Removing it is low-risk; verify on the next deploy that the environment's deployment
history still records the run (it should — the record is service-created).

---

## Q4 — Provider-specific credential scoping

### Cloudflare API token for `wrangler deploy`

The CI/CD docs recommend starting from the **"Edit Cloudflare Workers"** template and
then: "We recommend scoping these down as much as possible"
([GitHub Actions guide](https://developers.cloudflare.com/workers/ci-cd/external-cicd/github-actions/)).
Cloudflare's own statement of what a Workers deploy pipeline needs is the token it mints
for Workers Builds ([builds configuration](https://developers.cloudflare.com/workers/ci-cd/builds/configuration/)):

> Account: "Account Settings (read), Workers Scripts (edit), Workers KV Storage (edit),
> Workers R2 Storage (edit)"; Zone: "Workers Routes (edit) for all zones on the account";
> User: "User Details (read), Memberships (read)"

Mapped to this repo's worker (`workers/publisher/wrangler.jsonc`: script + static assets,
R2 *binding*, browser rendering binding, cron trigger, custom domain `dune.zone`), the
minimum is approximately:

- **Account → Workers Scripts: Edit** — the deploy itself, including asset upload and
  bindings ("Grants write access to Cloudflare Workers scripts" —
  [permissions reference](https://developers.cloudflare.com/fundamentals/api/reference/permissions/)).
- **Zone `dune.zone` → Workers Routes: Edit** — the `custom_domain: true` route.
- **Account → Account Settings: Read** — account metadata reads wrangler performs.
- *Not* needed: Workers KV Storage (no KV binding), Workers R2 Storage (an R2 **binding**
  is configured server-side as part of the script upload; wrangler does not need R2 data
  scopes to deploy it — only `wrangler r2` commands do), User Details / Memberships
  (only used to *discover* accounts when `CLOUDFLARE_ACCOUNT_ID` is not set; it is set
  here, and account-owned tokens have no user scopes at all).

Token type: prefer an **account-owned token** over a user token — tied to the account
as a service principal, only Super Admins can view/create, and it survives any user
leaving the account ([account-owned tokens](https://developers.cloudflare.com/fundamentals/api/get-started/account-owned-tokens/)).
Optional extras: TTL for forced rotation; client-IP filtering is not practical on
GitHub-hosted runners ([create token](https://developers.cloudflare.com/fundamentals/api/get-started/create-token/)).
Practical note: verify the scoped-down token with `wrangler deploy --dry-run` plus one
real deploy before revoking the old one; wrangler's error messages name the missing
permission when a scope is absent.

### Convex deploy keys

From [deploy key types](https://docs.convex.dev/cli/deploy-key-types) and
[dashboard deployment settings](https://docs.convex.dev/dashboard/deployments/deployment-settings):

- **Production deploy key** — deployment-scoped: "specifies the production deployment of
  a project and grants permissions to deploy code to it"; format
  `prod:deployment-name|eyJ2...=`.
- **Preview deploy key** — project-scoped (`preview:team-slug:project-slug|...`), exists
  to let `npx convex deploy` create/target preview deployments; wrong tool for this job.
- **Admin key** — "provides complete control over a deployment" and is "a[n] irrevocable
  secret baked into the deployment." Never put one in CI.
- **Permission scoping** — when creating a deploy key you "choose which actions it's
  allowed to perform"; the docs' CI recommendation: "For a CI/CD pipeline that runs
  `npx convex deploy`, enable the `deployment:deploy` permission." Extra grants (read
  logs, read/write data or env vars) exist for CLI/agent use — this pipeline needs
  `deployment:deploy`, plus whatever `migrations:deploy` / `publication-revisions.ts` /
  `convex env set` actually exercise (env-var write for the `SITE_URL` step; run-function
  access for the migration/revision scripts). Scope to the union of what the six steps
  do, nothing more.
- **No expiration** is documented for deploy keys; rotation is manual (dashboard delete or
  `npx convex deployment token delete`, re-mint with
  `npx convex deployment token create` — [CLI reference](https://docs.convex.dev/cli/reference/deployment)).
- **`CONVEX_DEPLOYMENT` may be redundant next to a prod deploy key**: "A deploy key, when
  set as `CONVEX_DEPLOY_KEY`, scopes all commands to the target deployment" — the key
  itself encodes the deployment. Before dropping the env var, check whether the repo's
  own scripts (`migrations:*`, `publication-revisions.ts`) read `CONVEX_DEPLOYMENT`
  directly; if only `npx convex` commands run, it is dead weight.

---

## Recommendations, ranked (security value ÷ maintenance cost)

### Do now

1. **Move the real secrets to `production` environment secrets + add a deployment branch
   policy (`main` only).** Highest value, near-zero cost: the job already declares
   `environment: production`, so this is dashboard-only — no workflow edit. It converts
   "any workflow on any ref can read the deploy credentials" into "only jobs on `main`
   that pass the environment's rules can." Do *not* add required reviewers or a wait
   timer — they would silently reverse the deliberate no-human-gate design (issue #286).
2. **Drop `deployments: write` from the job's `permissions`.** Nothing in the workflow
   calls the deployments API; the environment deployment record is created by the Actions
   service, not the token. One-line change; verify the deployment history entry still
   appears on the next deploy.
3. **Add `persist-credentials: false` to the checkout step.** No later step runs
   authenticated git (the `git diff`/`ls-files` verification is local), so the cost is
   zero and it removes the `GITHUB_TOKEN` from `.git/config` for the ~15 subsequent
   steps and all their dependencies. (When bumping to checkout v6 later, keep the
   explicit `false` anyway — v6 only relocates the credential, it doesn't stop
   persisting it.)
4. **Re-mint the Cloudflare token as a minimum-scope account-owned token**: Workers
   Scripts:Edit (account) + Workers Routes:Edit (zone `dune.zone`) + Account
   Settings:Read; drop everything else the "Edit Cloudflare Workers" template added.
   One-time dashboard task, no workflow change, and it caps the blast radius of the
   worst realistic event here (token exfiltration by a compromised dependency during a
   deploy step).
5. **Scope the Convex deploy key** to the permissions the six Convex steps actually use
   (`deployment:deploy` + env-var write for `convex env set` + whatever the migration/
   revision scripts need), re-minted via dashboard or `npx convex deployment token
   create`. Same shape as #4: one-time, no workflow change.
6. **Demote `CONVEX_DEPLOYMENT` and `VITE_CONVEX_URL` from secrets to variables** (they
   are public values — the deployment name is already printed in `wrangler.jsonc` vars,
   and the Vite URL ships in the client bundle). This removes pointless masking noise
   from deploy logs. First check whether `CONVEX_DEPLOYMENT` is needed at all alongside
   the deployment-scoped key.

### Not worth it here

- **Required reviewers / wait timers on `production`** — direct conflict with the
  auto-deploy-on-main architecture; branch protection is already the gate.
- **OIDC for Cloudflare or Convex** — neither vendor offers a first-party OIDC exchange
  (verified: absent from wrangler docs, `wrangler-action` inputs, Cloudflare API auth
  docs, and Convex deploy-key docs). Nothing to adopt; revisit if Cloudflare ever ships
  workload identity federation for its API.
- **Cloudflare token TTL / IP filtering** — TTL converts a security property into a
  recurring manual chore (rotation on a deadline) for a solo-maintained repo; IP
  filtering can't work on GitHub-hosted runners' dynamic egress.
- **Restructuring `env:` scoping** — already correct: every secret is step-level, and the
  two third-party actions (`setup-bun`, `cache`) run with no secrets in their
  environment. The residual risk (dependency code inside the secret-bearing `run:` steps)
  is addressed by #4/#5, not by YAML.
- **SHA-pinning `oven-sh/setup-bun` / `actions/cache`** — adjacent to this report's scope
  and real per GitHub's guidance ("Pinning an action to a full-length commit SHA is
  currently the only way to use an action as an immutable release"), but it is
  supply-chain hardening rather than secret handling, and it adds update friction;
  worth a separate decision, especially since #1–#5 already strip most of what a
  compromised action could steal.
