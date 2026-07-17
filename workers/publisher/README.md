# Scheduled production faction-sheet publisher

This is the production-shaped, sequential publisher surface. Its persistent release configuration
runs the owned publisher directly from one scheduled Worker invocation:

- `PUBLISHER_ENABLED` and `CRON_DISPATCH_ENABLED` are `true`;
- the Cron trigger list contains exactly one `*/5 * * * *` schedule;
- the dedicated private R2 bucket is named explicitly;
- capture and Convex HTTP URLs use the intended workers.dev and regional Convex origins;
- the primary semantic renderer and exact executable support set are `faction-sheet-v3`; Convex
  still recognizes v1/v2 publication and rollback metadata, while rollback execution uses the
  previously verified v2 Worker release; the separate SHA-256 renderer id
  identifies the exact assembled release for telemetry and canary checks;
- one narrow executor secret is a required binding and is not checked in;
- the Convex-only activation secret is distinct from every publisher boundary secret and is not
  checked in; it authenticates only initialize, pause, disable, guarded activate, and the strict
  rollout create/pause/resume/cancel/rollback/progress operation union.
- the cache-token signing secret is a required binding shared out-of-band with Convex and is not
  checked in or provisioned by this ticket. It has the exact canonical shape `s1.<43 base64url
  characters>`: version `s1`, a dot, and the unpadded canonical base64url encoding of 32 bytes from
  a cryptographically secure random generator. Missing, shorter, malformed, noncanonical, or
  mismatched values fail closed before signing, Cache API access, or R2 access. Ticket 6 must
  provision the identical generated value in both the Convex and Worker secret stores.

The scheduled handler acquires one Convex batch directly. Convex owns all batch, claim, retry,
snapshot, and publication state; R2 metadata is diagnostic only. The 240-second work deadline is a
single-invocation lifecycle bound, not a Browser quota reservation. Browser work stops early enough
to preserve cleanup and final Convex checkpoint time.

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
first-publication slot transactionally immediately before upload and admits at most 875 targets.
The Worker accepts exactly the 8,000,000-byte PDF cap, so admitted objects account for at most
7,000,000,000 PDF bytes. Slot reservations are conservative and survive upload/completion failure;
already-admitted stable objects may still be overwritten at the cap. Faction saves never consult
this counter and remain immediate.

The Worker intentionally has no `limits.cpu_ms` block. A real production two-item invocation used
291 ms CPU and 19,091 ms wall time, comfortably inside the 30-second CPU limit for a sub-hour Cron
on Workers Paid.

Convex now contains a disabled-first rollout control plane with page-50 discovery and batch-retaining
rollout checkpoints, but no rollout is created or resumed by deployment. One scheduled invocation
acquires one Convex batch, opens one Browser Session, checkpoints at most two items sequentially,
closes the Browser, and releases the exact batch once.

The release keeps its existing embedded renderer support set. Every accepted claim uses the current
A4 capture/PDF behavior; there is no separate legacy-geometry rendering path.
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
environment variable; the API token is a protected secret. The exact R2 name remains in
`wrangler.jsonc`, and required Worker secret names are validated by Wrangler during deploy.

**Release prerequisite: Convex publisher config and singleton must both be paused before this
scheduled Worker release is merged or deployed.** The stable private bucket must be reverified, the
disabled-first publication-admission and paid-plan cleanup migrations must pass, and both Worker
secrets must be installed. Deploy `true/true` plus the exact five-minute Cron against paused Convex,
observe at least one empty Cron with no Browser Run, and only then consider
the separately approved Convex operator activation. Normal `main` deploys after that activation keep
this same scheduled source configuration; they never re-run or reverse the activation transition.
