# Scheduled production faction-sheet publisher

This is the production-shaped, sequential publisher surface. Its stable Cloudflare resources are
provisioned, and the persistent release configuration is ready for scheduled polling:

- `PUBLISHER_ENABLED` and `CRON_DISPATCH_ENABLED` are `true`;
- the Cron trigger list contains exactly one `*/15 * * * *` schedule;
- the production Queue and dedicated private R2 bucket are named explicitly;
- capture and Convex HTTP URLs use the intended workers.dev and regional Convex origins;
- the configured semantic renderer is `faction-sheet-v1`; the separate SHA-256 renderer id
  identifies the exact assembled release for telemetry and canary checks;
- poll and executor secrets are distinct required bindings and are not checked in.
- the Convex-only activation secret is distinct from every publisher boundary secret and is not
  checked in; it authenticates only initialize, pause, disable, guarded activate, and the strict
  rollout create/pause/resume/cancel/rollback/progress operation union.
- the cache-token signing secret is a required binding shared out-of-band with Convex and is not
  checked in or provisioned by this ticket. It has the exact canonical shape `s1.<43 base64url
  characters>`: version `s1`, a dot, and the unpadded canonical base64url encoding of 32 bytes from
  a cryptographically secure random generator. Missing, shorter, malformed, noncanonical, or
  mismatched values fail closed before signing, Cache API access, or R2 access. Ticket 6 must
  provision the identical generated value in both the Convex and Worker secret stores.

The Queue payload is only `{ schemaVersion, scheduledCutoff, triggerId }`. Convex owns all batch,
claim, retry, snapshot, publication, and Browser reservation state. R2 metadata is diagnostic only.
The 240-second work deadline and fixed 240-second Browser reservation cannot be extended by phase
settings. A separate 30-second
post-lifecycle window may only settle definitely closed Browser usage; it is bounded well inside the
15-minute Queue wall and cannot perform more Browser, R2, or publication work.

The capture shell, HTML, and isolated bundle revalidate the host-only render capability against the
exact Convex snapshot endpoint before serving. Capture diagnostics retain at most an artwork
origin plus a redacted marker, never userinfo, path, query, or fragment data.

Public delivery serves only `/published/factions/<Convex faction id>/sheet.pdf` from the private R2
binding. The `/published` prefix deliberately separates Worker-owned delivery from ordinary SPA
routes such as `/factions/<slug>`. Malformed or unknown published paths fail closed and never fall
through to the SPA shell.
Signed publication tokens are verified locally before cache or R2 access. Cache API entries use the
Worker request origin plus the exact stable path and exact valid token; unrelated query parameters
are discarded. Cache API contents are data-center local and this Worker does not implement
single-flight request coalescing: concurrent misses may each perform one R2 `get`, but no request
performs more than one. Full successful tokenized GETs alone are inserted into cache; tokenless,
partial, conditional-negative, missing, and error responses are never inserted.

Storage is structurally bounded instead of estimated from a timestamp. A dedicated private bucket
holds exactly one stable `factions/<id>/sheet.pdf` object per admitted faction. Convex reserves a
first-publication slot transactionally immediately before upload and admits at most 3,500 targets.
The Worker accepts exactly the 2,000,000-byte PDF cap, so admitted objects account for at most
7,000,000,000 PDF bytes. Slot reservations are conservative and survive upload/completion failure;
already-admitted stable objects may still be overwritten at the cap. Faction saves never consult
this counter and remain immediate.

The Worker intentionally has no `limits.cpu_ms` block. Current Queue documentation describes a
30-second default consumer CPU limit, while the real Workers Free proof rejected a custom limit and
successfully measured the actual default at 270 ms CPU for one PDF. Ticket 6 must preserve the
no-custom-limit configuration and re-measure the production one-item path rather than infer a Free
allowance from the generic documentation.

See [MEASUREMENT.md](./MEASUREMENT.md) for the pre-measurement telemetry contract, the production
metrics Ticket 6 must join from Cloudflare, and the Ticket 7 scaling work that remains blocked.
Convex now contains a disabled-first rollout control plane with page-50 discovery and batch-retaining
rollout checkpoints, but no rollout is created or resumed by deployment. Promotion reports are
recommendation-only. `EXECUTOR_MAX_ITEMS` accepts `1` or `2`; the checked-in functional canary is
`2`, while Queue message batch size and concurrency remain `1`. One consumer invocation acquires
one Convex batch, opens one Browser Session, checkpoints at most two items sequentially, then
settles and releases the exact batch once.

The only executable semantic renderer remains the release's embedded `faction-sheet-v1` contract.
The rollout operator schema and mutation both reject any other string. Supporting a future candidate
requires an ordered compatibility release: widen the Worker to embed/authorize that semantic
renderer, verify its exact release id and a PDF canary, then widen the strict Convex operator
validator before activation or paused rollout creation. Operator input alone is never support proof.

## Local checks

`publisher:assets` first builds the complete TanStack SPA, then builds the isolated capture bundle,
combines both outputs into `workers/publisher/dist`, omits Netlify's `_redirects`, creates the
Cloudflare SPA `index.html` as an exact copy of `_shell.html`, and enforces the Workers Free asset
count plus the 25 MiB per-file limit. Assembly canonicalizes the volatile TanStack root hydration
timestamp so identical inputs produce one stable release and renderer identity. Set
`VITE_CONVEX_URL` to the intended build-time Convex URL.

```bash
bun run publisher:types
bun run publisher:types:check
bun run publisher:typecheck
bun run publisher:test
bun run publisher:assets
bun run publisher:assets:check
bun run publisher:font-regression
bun run publisher:dry-run
bun run publisher:startup
```

The protected `main` workflow runs the release gates after Convex deploy and required migrations:
source/config preflight, generated-type check, typecheck, one production-URL asset build, assembled
asset check, clean-source check, Wrangler dry-run, strict SHA-tagged deploy, and `true/true`
workers.dev health smoke. Netlify refreshes the same `dist/client` only afterward as rollback. The
workflow does not provision resources, install/read secrets, override flags/Cron/routes, call the
operator endpoint, mutate publisher data, or activate Convex.

Do not merge the CI deployment slice until the protected GitHub `production` environment contains
the account-scoped least-privilege `CLOUDFLARE_API_TOKEN`. `CLOUDFLARE_ACCOUNT_ID` is a protected
environment variable; the API token is a protected secret. The exact Queue and R2 names remain in
`wrangler.jsonc`, and required Worker secret names are validated by Wrangler during deploy.

**Release prerequisite: Convex publisher config and singleton must both be paused before this
scheduled Worker release is merged or deployed.** The stable private bucket and Queue must be
reverified, the disabled-first publication-admission migration/counter must pass, and the three
Worker secrets must be installed. Deploy `true/true` plus the exact 15-minute Cron against paused
Convex, observe at least one empty Cron with no Queue message or Browser Run, and only then consider
the separately approved Convex operator activation. Normal `main` deploys after that activation keep
this same scheduled source configuration; they never re-run or reverse the activation transition.
